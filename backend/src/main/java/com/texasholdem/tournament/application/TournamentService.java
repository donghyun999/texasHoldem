package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.BlindLevel;
import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentPlayerView;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
public class TournamentService {

    private static final int MAX_SEATS = 6;
    private static final int STARTING_STACK = 1_000;
    private static final List<String> DEFAULT_BOARD_RUNOUT = List.of("AH", "KD", "7C", "4S", "2D");
    private static final List<BlindLevel> DEFAULT_LEVELS = List.of(
            new BlindLevel(1, 10, 20, 300),
            new BlindLevel(2, 15, 30, 300),
            new BlindLevel(3, 25, 50, 300),
            new BlindLevel(4, 50, 100, 300),
            new BlindLevel(5, 75, 150, 300),
            new BlindLevel(6, 100, 200, 300)
    );

    private final ConcurrentMap<String, TournamentState> tournaments = new ConcurrentHashMap<>();

    // Issues a lightweight guest identity for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        return new GuestSession(nextGuestId(), normalizeNickname(nickname));
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        var code = nextTournamentCode();
        var tournament = new TournamentState(code);
        tournament.players.add(TournamentPlayerState.owner(guestId, normalizeNickname(nickname), 0));
        tournament.tableMessage = "Tournament created. Owner can wait for ready players.";
        tournaments.put(code, tournament);
        return tournament.toSnapshot();
    }

    // Returns the latest server-side snapshot for a tournament code.
    public TournamentSnapshot getTournament(String code) {
        return requireTournament(code).toSnapshot();
    }

    // Seats a guest into the next available seat while the tournament is waiting.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            requireWaiting(tournament);
            if (tournament.players.size() >= MAX_SEATS) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is full");
            }
            if (findPlayer(tournament, guestId) != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Guest is already seated");
            }

            var normalizedNickname = normalizeNickname(nickname);
            var nicknameTaken = tournament.players.stream()
                    .anyMatch(player -> player.nickname.equalsIgnoreCase(normalizedNickname));
            if (nicknameTaken) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nickname is already taken");
            }

            tournament.players.add(new TournamentPlayerState(guestId, normalizedNickname, nextSeatIndex(tournament.players)));
            tournament.tableMessage = normalizedNickname + " joined the tournament.";
            return tournament.toSnapshot();
        }
    }

    // Toggles the ready flag for a seated player before the tournament starts.
    public TournamentEvent changeReady(String code, String guestId, boolean ready) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            requireWaiting(tournament);
            var player = requirePlayer(tournament, guestId);
            player.status = ready ? PlayerStatus.READY : PlayerStatus.SEATED;
            tournament.tableMessage = player.nickname + (ready ? " is ready." : " is not ready.");
            return buildEvent("readyChanged", tournament, Map.of(
                    "guestId", guestId,
                    "ready", ready
            ));
        }
    }

    // Converts ready players into active participants and opens the first hand.
    public TournamentEvent startTournament(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            requireWaiting(tournament);
            var owner = requirePlayer(tournament, guestId);
            if (!owner.owner) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can start the tournament");
            }

            var readyPlayers = tournament.players.stream()
                    .filter(player -> player.status == PlayerStatus.READY)
                    .sorted(Comparator.comparingInt(player -> player.seatIndex))
                    .toList();
            if (readyPlayers.size() < 2) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least two ready players are required");
            }

            for (var player : tournament.players) {
                player.acting = false;
                player.participating = player.status == PlayerStatus.READY;
                if (player.participating) {
                    player.stack = player.stack > 0 ? player.stack : STARTING_STACK;
                    player.status = PlayerStatus.ACTIVE;
                } else {
                    player.status = PlayerStatus.SEATED;
                    player.stack = 0;
                }
            }

            tournament.status = TournamentStatus.IN_HAND;
            tournament.levelIndex = 0;
            tournament.levelActivatedAtEpochSecond = Instant.now().getEpochSecond();
            tournament.round = BettingRound.PRE_FLOP;
            tournament.currentBet = 0;
            tournament.boardCards = new ArrayList<>();
            tournament.hiddenBoardCards = new ArrayList<>(DEFAULT_BOARD_RUNOUT);
            tournament.sidePots = new ArrayList<>();
            tournament.mainPot = 0;

            var orderedSeats = readyPlayers.stream()
                    .map(player -> player.seatIndex)
                    .toList();
            tournament.dealerSeat = orderedSeats.get(0);
            if (orderedSeats.size() == 2) {
                tournament.smallBlindSeat = orderedSeats.get(0);
                tournament.bigBlindSeat = orderedSeats.get(1);
            } else {
                tournament.smallBlindSeat = orderedSeats.get(1);
                tournament.bigBlindSeat = orderedSeats.get(2);
            }

            resetHandState(tournament);
            applyBlind(tournament, tournament.smallBlindSeat, DEFAULT_LEVELS.get(0).smallBlind());
            applyBlind(tournament, tournament.bigBlindSeat, DEFAULT_LEVELS.get(0).bigBlind());
            tournament.currentBet = tournament.players.stream()
                    .filter(TournamentPlayerState::isInHand)
                    .mapToInt(player -> player.roundContribution)
                    .max()
                    .orElse(0);
            markAwaitingPlayers(tournament);
            tournament.actingSeat = nextAwaitingSeatAfter(tournament, tournament.bigBlindSeat);
            setActingPlayer(tournament, tournament.actingSeat);
            tournament.availableActions = tournament.actingSeat == null
                    ? new ArrayList<>()
                    : new ArrayList<>(buildAvailableActions(tournament, requireSeatPlayer(tournament, tournament.actingSeat)));
            tournament.tableMessage = "Tournament started. Preflop action is open.";
            refreshPots(tournament);

            return buildEvent("handStarted", tournament, Map.of(
                    "participants", readyPlayers.size()
            ));
        }
    }

    // Applies a betting action, updates contributions, and advances the hand state.
    public TournamentEvent applyAction(String code, String guestId, String action, Integer amount) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            if (tournament.status != TournamentStatus.IN_HAND) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is not currently in hand");
            }

            var player = requirePlayer(tournament, guestId);
            if (!player.acting || player.status != PlayerStatus.ACTIVE) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player cannot act right now");
            }

            var normalizedAction = action.trim().toUpperCase(Locale.ROOT);
            var contribution = applyPlayerAction(tournament, player, normalizedAction, amount);
            player.acting = false;
            refreshPots(tournament);
            resolveActionState(tournament, player, normalizedAction);

            return buildEvent("actionApplied", tournament, Map.of(
                    "guestId", guestId,
                    "action", normalizedAction,
                    "amount", contribution
            ));
        }
    }

    // Resolves a tournament code into its mutable state container.
    private TournamentState requireTournament(String code) {
        var normalizedCode = code.trim().toUpperCase(Locale.ROOT);
        var tournament = tournaments.get(normalizedCode);
        if (tournament == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tournament not found");
        }
        return tournament;
    }

    // Rejects mutations that are only valid in the waiting room.
    private void requireWaiting(TournamentState tournament) {
        if (tournament.status != TournamentStatus.WAITING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is not accepting waiting-room changes");
        }
    }

    // Locates a player or fails with a request-scoped error.
    private TournamentPlayerState requirePlayer(TournamentState tournament, String guestId) {
        var player = findPlayer(tournament, guestId);
        if (player == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player is not part of this tournament");
        }
        return player;
    }

    // Looks up a player by guest identifier inside a tournament.
    private TournamentPlayerState findPlayer(TournamentState tournament, String guestId) {
        return tournament.players.stream()
                .filter(player -> player.guestId.equals(guestId))
                .findFirst()
                .orElse(null);
    }

    // Trims user-facing nicknames before persisting them in memory.
    private String normalizeNickname(String nickname) {
        return nickname == null ? "" : nickname.trim();
    }

    // Creates a stable guest id suitable for local persistence on the client.
    private String nextGuestId() {
        return "guest-" + UUID.randomUUID().toString().substring(0, 8);
    }

    // Generates a short room code for a single-table tournament.
    private String nextTournamentCode() {
        while (true) {
            var code = randomCode(5);
            if (!tournaments.containsKey(code)) {
                return code;
            }
        }
    }

    // Builds an uppercase code using a typo-resistant alphabet.
    private String randomCode(int length) {
        var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var builder = new StringBuilder(length);
        for (var index = 0; index < length; index++) {
            var next = ThreadLocalRandom.current().nextInt(alphabet.length());
            builder.append(alphabet.charAt(next));
        }
        return builder.toString();
    }

    // Finds the lowest unused seat index in the six-seat layout.
    private int nextSeatIndex(List<TournamentPlayerState> players) {
        for (var seat = 0; seat < MAX_SEATS; seat++) {
            var currentSeat = seat;
            var occupied = players.stream().anyMatch(player -> player.seatIndex == currentSeat);
            if (!occupied) {
                return seat;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No seat is available");
    }

    // Clears hand-local counters before blinds and player actions are applied.
    private void resetHandState(TournamentState tournament) {
        for (var player : tournament.players) {
            player.totalContribution = 0;
            player.roundContribution = 0;
            player.awaitingAction = false;
        }
    }

    // Pulls the blind amount from a specific player and updates all-in status if needed.
    private void applyBlind(TournamentState tournament, Integer seatIndex, int blindAmount) {
        if (seatIndex == null) {
            return;
        }
        var player = requireSeatPlayer(tournament, seatIndex);
        contribute(player, blindAmount);
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
    }

    // Deducts chips up to the remaining stack and records the hand contributions.
    private int contribute(TournamentPlayerState player, int requestedAmount) {
        if (requestedAmount <= 0 || player.stack <= 0) {
            return 0;
        }
        var paid = Math.min(player.stack, requestedAmount);
        player.stack -= paid;
        player.totalContribution += paid;
        player.roundContribution += paid;
        return paid;
    }

    // Applies one player action against the current betting round state.
    private int applyPlayerAction(
            TournamentState tournament,
            TournamentPlayerState player,
            String normalizedAction,
            Integer amount
    ) {
        return switch (normalizedAction) {
            case "CHECK" -> applyCheck(tournament, player);
            case "CALL" -> applyCall(tournament, player);
            case "BET", "RAISE" -> applyRaise(tournament, player, amount);
            case "ALL_IN" -> applyAllIn(tournament, player);
            case "FOLD" -> applyFold(player);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported action: " + normalizedAction);
        };
    }

    // Validates a zero-cost action when the player has matched the current bet.
    private int applyCheck(TournamentState tournament, TournamentPlayerState player) {
        if (chipsToCall(tournament, player) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player must call, raise, or fold");
        }
        player.awaitingAction = false;
        return 0;
    }

    // Matches the current bet and allows short all-in calls when the stack is not enough.
    private int applyCall(TournamentState tournament, TournamentPlayerState player) {
        var chipsToCall = chipsToCall(tournament, player);
        if (chipsToCall <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to call");
        }
        var paid = contribute(player, chipsToCall);
        player.awaitingAction = false;
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Raises the round bet to a target contribution and reopens action for others.
    private int applyRaise(TournamentState tournament, TournamentPlayerState player, Integer amount) {
        var targetContribution = resolveRaiseTarget(tournament, amount);
        if (targetContribution <= tournament.currentBet) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise must increase the current bet");
        }

        var additionalChips = targetContribution - player.roundContribution;
        if (additionalChips <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise target is already satisfied");
        }
        if (additionalChips > player.stack) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise exceeds the remaining stack");
        }

        var paid = contribute(player, additionalChips);
        tournament.currentBet = player.roundContribution;
        player.awaitingAction = false;
        reopenAction(tournament, player.seatIndex);
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Pushes the remaining stack and reopens action only when the shove increases the bet.
    private int applyAllIn(TournamentState tournament, TournamentPlayerState player) {
        if (player.stack <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player has no chips left");
        }

        var previousBet = tournament.currentBet;
        var paid = contribute(player, player.stack);
        player.status = PlayerStatus.ALL_IN;
        player.awaitingAction = false;
        if (player.roundContribution > previousBet) {
            tournament.currentBet = player.roundContribution;
            reopenAction(tournament, player.seatIndex);
        }
        return paid;
    }

    // Folds the hand and removes the player from further action.
    private int applyFold(TournamentPlayerState player) {
        player.status = PlayerStatus.FOLDED;
        player.awaitingAction = false;
        return 0;
    }

    // Reopens action for remaining active players after a new highest bet appears.
    private void reopenAction(TournamentState tournament, int actorSeat) {
        for (var candidate : tournament.players) {
            candidate.awaitingAction = candidate.status == PlayerStatus.ACTIVE && candidate.seatIndex != actorSeat;
        }
    }

    // Chooses the target round contribution for bet and raise actions.
    private int resolveRaiseTarget(TournamentState tournament, Integer amount) {
        if (amount != null) {
            return amount;
        }
        return tournament.currentBet == 0
                ? DEFAULT_LEVELS.get(tournament.levelIndex).bigBlind()
                : tournament.currentBet + DEFAULT_LEVELS.get(tournament.levelIndex).bigBlind();
    }

    // Returns how many chips the player still needs to match the current round bet.
    private int chipsToCall(TournamentState tournament, TournamentPlayerState player) {
        return Math.max(0, tournament.currentBet - player.roundContribution);
    }

    // Refreshes the main pot and side pots from all total contribution tiers.
    private void refreshPots(TournamentState tournament) {
        var tiers = tournament.players.stream()
                .mapToInt(player -> player.totalContribution)
                .filter(amount -> amount > 0)
                .distinct()
                .sorted()
                .toArray();

        if (tiers.length == 0) {
            tournament.mainPot = 0;
            tournament.sidePots = new ArrayList<>();
            return;
        }

        var pots = new ArrayList<PotView>();
        var previousTier = 0;
        for (var index = 0; index < tiers.length; index++) {
            var tier = tiers[index];
            var contributorCount = (int) tournament.players.stream()
                    .filter(player -> player.totalContribution >= tier)
                    .count();
            if (contributorCount < 2) {
                previousTier = tier;
                continue;
            }
            var potAmount = (tier - previousTier) * contributorCount;
            if (potAmount <= 0) {
                previousTier = tier;
                continue;
            }

            var eligiblePlayers = tournament.players.stream()
                    .filter(player -> player.totalContribution >= tier)
                    .filter(TournamentPlayerState::isEligibleForPot)
                    .map(player -> player.guestId)
                    .toList();
            var potType = index == 0 ? "MAIN" : "SIDE";
            pots.add(new PotView(
                    index == 0 ? "main" : "side-" + index,
                    potType,
                    potAmount,
                    eligiblePlayers
            ));
            previousTier = tier;
        }

        tournament.mainPot = pots.isEmpty() ? 0 : pots.get(0).amount();
        tournament.sidePots = pots.size() <= 1
                ? new ArrayList<>()
                : new ArrayList<>(pots.subList(1, pots.size()));
    }

    // Resolves the next actor, street transition, or hand-result state after an action.
    private void resolveActionState(TournamentState tournament, TournamentPlayerState player, String action) {
        if (countContestingPlayers(tournament) <= 1) {
            finishHand(tournament, player.nickname + " closed the action. One player remains.");
            return;
        }
        if (countPlayersAbleToAct(tournament) == 0) {
            revealFullBoard(tournament);
            finishHand(tournament, "All remaining players are all-in. Showdown is ready.");
            return;
        }

        var nextSeat = nextAwaitingSeatAfter(tournament, player.seatIndex);
        if (nextSeat != null) {
            tournament.actingSeat = nextSeat;
            setActingPlayer(tournament, nextSeat);
            tournament.availableActions = new ArrayList<>(buildAvailableActions(tournament, requireSeatPlayer(tournament, nextSeat)));
            tournament.tableMessage = player.nickname + " applied " + action + ".";
            return;
        }

        advanceRoundOrFinish(tournament);
    }

    // Advances the board when a betting round is closed or finishes the hand on the river.
    private void advanceRoundOrFinish(TournamentState tournament) {
        if (tournament.round == BettingRound.RIVER) {
            revealFullBoard(tournament);
            finishHand(tournament, "River action is closed. Showdown is ready.");
            return;
        }

        tournament.round = tournament.round.next();
        resetRoundContributions(tournament);
        tournament.currentBet = 0;
        revealBoardForRound(tournament);
        if (countPlayersAbleToAct(tournament) <= 1) {
            revealFullBoard(tournament);
            finishHand(tournament, "Further betting is closed. Showdown is ready.");
            return;
        }

        markAwaitingPlayers(tournament);
        var startSeat = nextActiveSeatAfter(tournament, tournament.dealerSeat == null ? -1 : tournament.dealerSeat);
        tournament.actingSeat = startSeat;
        setActingPlayer(tournament, startSeat);
        tournament.availableActions = startSeat == null
                ? new ArrayList<>()
                : new ArrayList<>(buildAvailableActions(tournament, requireSeatPlayer(tournament, startSeat)));
        tournament.tableMessage = tournament.round.openMessage();
    }

    // Clears round-local contributions once a street is complete.
    private void resetRoundContributions(TournamentState tournament) {
        for (var player : tournament.players) {
            player.roundContribution = 0;
            player.awaitingAction = false;
        }
    }

    // Marks every active player with chips as pending action in the current round.
    private void markAwaitingPlayers(TournamentState tournament) {
        for (var player : tournament.players) {
            player.awaitingAction = player.status == PlayerStatus.ACTIVE;
        }
    }

    // Reveals the current number of board cards for the active betting round.
    private void revealBoardForRound(TournamentState tournament) {
        var visibleCards = tournament.round.visibleBoardCards();
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards.subList(0, visibleCards));
    }

    // Reveals all board cards when no further betting action is possible.
    private void revealFullBoard(TournamentState tournament) {
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards);
    }

    // Moves the tournament into hand-result state and clears action affordances.
    private void finishHand(TournamentState tournament, String tableMessage) {
        tournament.status = TournamentStatus.HAND_RESULT;
        tournament.actingSeat = null;
        tournament.availableActions = new ArrayList<>();
        setActingPlayer(tournament, null);
        tournament.tableMessage = tableMessage;
    }

    // Counts the players that still have a claim on the pot after folds are removed.
    private long countContestingPlayers(TournamentState tournament) {
        return tournament.players.stream()
                .filter(TournamentPlayerState::isEligibleForPot)
                .count();
    }

    // Counts the players that still have chips and legal action available this hand.
    private long countPlayersAbleToAct(TournamentState tournament) {
        return tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE)
                .count();
    }

    // Builds the action affordances for the current acting player.
    private List<String> buildAvailableActions(TournamentState tournament, TournamentPlayerState player) {
        if (player.status != PlayerStatus.ACTIVE || player.stack <= 0) {
            return List.of();
        }

        var chipsToCall = chipsToCall(tournament, player);
        var actions = new ArrayList<String>();
        if (chipsToCall > 0) {
            actions.add("FOLD");
            actions.add("CALL");
            if (player.stack > chipsToCall) {
                actions.add("RAISE");
            }
            actions.add("ALL_IN");
            return actions;
        }

        actions.add("CHECK");
        actions.add(tournament.currentBet == 0 ? "BET" : "RAISE");
        actions.add("ALL_IN");
        return actions;
    }

    // Resolves a seated player by seat index inside one tournament hand.
    private TournamentPlayerState requireSeatPlayer(TournamentState tournament, int seatIndex) {
        return tournament.players.stream()
                .filter(candidate -> candidate.seatIndex == seatIndex)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Seat player not found"));
    }

    // Finds the next player that can still act in the current hand.
    private Integer nextActiveSeatAfter(TournamentState tournament, int currentSeat) {
        var activeSeats = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE)
                .map(player -> player.seatIndex)
                .sorted()
                .toList();

        if (activeSeats.isEmpty()) {
            return null;
        }

        return activeSeats.stream()
                .filter(seat -> seat > currentSeat)
                .findFirst()
                .orElse(activeSeats.get(0));
    }

    // Finds the next player that still owes an action in the current betting round.
    private Integer nextAwaitingSeatAfter(TournamentState tournament, int currentSeat) {
        var awaitingSeats = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE && player.awaitingAction)
                .map(player -> player.seatIndex)
                .sorted()
                .toList();

        if (awaitingSeats.isEmpty()) {
            return null;
        }

        return awaitingSeats.stream()
                .filter(seat -> seat > currentSeat)
                .findFirst()
                .orElse(awaitingSeats.get(0));
    }

    // Marks a single player as the current actor and clears the rest.
    private void setActingPlayer(TournamentState tournament, Integer seatIndex) {
        for (var player : tournament.players) {
            player.acting = seatIndex != null && player.seatIndex == seatIndex && player.status == PlayerStatus.ACTIVE;
        }
    }

    // Wraps a fresh tournament snapshot with an event name and payload.
    private TournamentEvent buildEvent(String eventType, TournamentState tournament, Map<String, Object> payload) {
        return new TournamentEvent(eventType, tournament.toSnapshot(), payload);
    }

    private final class TournamentState {
        private final String code;
        private final List<TournamentPlayerState> players = new ArrayList<>();
        private TournamentStatus status = TournamentStatus.WAITING;
        private int levelIndex = 0;
        private long levelActivatedAtEpochSecond = 0;
        private int mainPot = 0;
        private List<PotView> sidePots = new ArrayList<>();
        private BettingRound round = BettingRound.PRE_FLOP;
        private int currentBet = 0;
        private List<String> boardCards = new ArrayList<>();
        private List<String> hiddenBoardCards = new ArrayList<>();
        private Integer dealerSeat;
        private Integer smallBlindSeat;
        private Integer bigBlindSeat;
        private Integer actingSeat;
        private List<String> availableActions = new ArrayList<>();
        private String tableMessage = "";

        // Initializes a new mutable tournament container for one code.
        private TournamentState(String code) {
            this.code = code;
        }

        // Converts mutable in-memory state into the API snapshot contract.
        private TournamentSnapshot toSnapshot() {
            var currentLevel = DEFAULT_LEVELS.get(levelIndex);
            var nextLevel = DEFAULT_LEVELS.get(Math.min(levelIndex + 1, DEFAULT_LEVELS.size() - 1));
            var now = Instant.now().getEpochSecond();
            var levelEndsAt = levelActivatedAtEpochSecond == 0
                    ? now + currentLevel.durationSeconds()
                    : levelActivatedAtEpochSecond + currentLevel.durationSeconds();
            var secondsUntilNextLevel = Math.max(0, levelEndsAt - now);

            var playerViews = players.stream()
                    .sorted(Comparator.comparingInt(player -> player.seatIndex))
                    .map(player -> new TournamentPlayerView(
                            player.guestId,
                            player.nickname,
                            player.seatIndex,
                            player.status,
                            player.stack,
                            player.owner,
                            player.connected,
                            player.participating,
                            player.acting
                    ))
                    .collect(Collectors.toList());

            return new TournamentSnapshot(
                    code,
                    status,
                    currentLevel,
                    nextLevel,
                    levelEndsAt,
                    secondsUntilNextLevel,
                    mainPot,
                    List.copyOf(sidePots),
                    List.copyOf(boardCards),
                    dealerSeat,
                    smallBlindSeat,
                    bigBlindSeat,
                    actingSeat,
                    playerViews,
                    List.copyOf(availableActions),
                    tableMessage
            );
        }
    }

    private static final class TournamentPlayerState {
        private final String guestId;
        private final String nickname;
        private final int seatIndex;
        private int stack = 0;
        private PlayerStatus status = PlayerStatus.SEATED;
        private boolean owner = false;
        private boolean connected = true;
        private boolean participating = false;
        private boolean acting = false;
        private int totalContribution = 0;
        private int roundContribution = 0;
        private boolean awaitingAction = false;

        // Stores mutable player state for the in-memory tournament model.
        private TournamentPlayerState(String guestId, String nickname, int seatIndex) {
            this.guestId = guestId;
            this.nickname = nickname;
            this.seatIndex = seatIndex;
        }

        // Tells whether the player is still eligible to win a pot this hand.
        private boolean isEligibleForPot() {
            return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
        }

        // Tells whether the player is still part of the current hand state.
        private boolean isInHand() {
            return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
        }

        // Marks the creating player as the table owner.
        private static TournamentPlayerState owner(String guestId, String nickname, int seatIndex) {
            var player = new TournamentPlayerState(guestId, nickname, seatIndex);
            player.owner = true;
            return player;
        }
    }

    private enum BettingRound {
        PRE_FLOP(0, "Preflop action is open."),
        FLOP(3, "Flop action is open."),
        TURN(4, "Turn action is open."),
        RIVER(5, "River action is open.");

        private final int visibleBoardCards;
        private final String openMessage;

        // Stores the board size and message for a betting street transition.
        BettingRound(int visibleBoardCards, String openMessage) {
            this.visibleBoardCards = visibleBoardCards;
            this.openMessage = openMessage;
        }

        // Moves the hand to the next betting street.
        private BettingRound next() {
            return switch (this) {
                case PRE_FLOP -> FLOP;
                case FLOP -> TURN;
                case TURN, RIVER -> RIVER;
            };
        }

        // Returns how many board cards should be visible for this street.
        private int visibleBoardCards() {
            return visibleBoardCards;
        }

        // Returns the table message for a newly opened street.
        private String openMessage() {
            return openMessage;
        }
    }
}
