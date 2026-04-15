package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;

@Component
final class TournamentLobbyManager {

    private final TournamentStateAccess stateAccess;
    private final TournamentRules rules;
    private final TournamentIdentityFactory identityFactory;

    // Wires waiting-room mutations to the shared state and rule helpers.
    TournamentLobbyManager(
            TournamentStateAccess stateAccess,
            TournamentRules rules,
            TournamentIdentityFactory identityFactory
    ) {
        this.stateAccess = stateAccess;
        this.rules = rules;
        this.identityFactory = identityFactory;
    }

    // Creates a waiting tournament state and seats the owner immediately.
    TournamentState createTournament(
            String code,
            String roomName,
            String roomPassword,
            String guestId,
            String nickname,
            TournamentVisibility visibility
    ) {
        var tournament = new TournamentState(code);
        tournament.roomName = roomName;
        tournament.roomPassword = roomPassword == null ? "" : roomPassword;
        tournament.visibility = visibility;
        tournament.players.add(TournamentPlayerState.owner(guestId, identityFactory.normalizeNickname(nickname), 0));
        tournament.tableMessage = visibility == TournamentVisibility.PUBLIC
                ? roomName + " 테이블이 로비에서 입장 가능합니다."
                : roomName + " 테이블이 준비됐습니다. 방 이름과 비밀번호를 공유해 초대하세요.";
        return tournament;
    }

    // Adds one guest to the next open waiting-room seat.
    void joinTournament(TournamentState tournament, String guestId, String nickname) {
        stateAccess.requireWaiting(tournament);
        if (tournament.players.size() >= rules.maxSeats()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "테이블이 가득 찼습니다.");
        }
        if (stateAccess.findPlayer(tournament, guestId) != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 이 테이블에 입장해 있습니다.");
        }

        var normalizedNickname = identityFactory.normalizeNickname(nickname);
        var nicknameTaken = tournament.players.stream()
                .anyMatch(player -> player.nickname.equalsIgnoreCase(normalizedNickname));
        if (nicknameTaken) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미 사용 중인 닉네임입니다.");
        }

        tournament.players.add(new TournamentPlayerState(
                guestId,
                normalizedNickname,
                stateAccess.nextSeatIndex(tournament.players)
        ));
        tournament.tableMessage = normalizedNickname + " 님이 테이블에 입장했습니다.";
    }

    // Toggles the ready flag for one seated player before the tournament starts.
    void changeReady(TournamentState tournament, String guestId, boolean ready) {
        stateAccess.requireWaiting(tournament);
        var player = stateAccess.requirePlayer(tournament, guestId);
        player.status = ready ? PlayerStatus.READY : PlayerStatus.SEATED;
        tournament.tableMessage = player.nickname + (ready ? " 님이 준비 완료했습니다." : " 님이 준비를 해제했습니다.");
    }

    // Verifies that the caller currently owns tournament start authority.
    void requireOwner(TournamentState tournament, String guestId) {
        var owner = stateAccess.requirePlayer(tournament, guestId);
        if (!owner.owner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "방장만 게임을 시작할 수 있습니다.");
        }
    }

    // Promotes ready players into the field and initializes the first tournament hand.
    int startTournament(TournamentState tournament, String guestId) {
        requireOwner(tournament, guestId);
        stateAccess.requireWaiting(tournament);

        var readyPlayers = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.READY)
                .sorted(Comparator.comparingInt(player -> player.seatIndex))
                .toList();
        if (readyPlayers.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "준비 완료한 플레이어가 최소 2명 필요합니다.");
        }

        for (var player : tournament.players) {
            player.acting = false;
            player.participating = player.status == PlayerStatus.READY;
            if (player.participating) {
                player.stack = player.stack > 0 ? player.stack : rules.startingStack();
                player.status = PlayerStatus.ACTIVE;
            } else {
                player.status = PlayerStatus.SEATED;
                player.stack = 0;
            }
        }

        tournament.status = TournamentStatus.IN_HAND;
        tournament.levelIndex = 0;
        tournament.levelActivatedAtEpochSecond = Instant.now().getEpochSecond();
        tournament.dealerSeat = null;
        tournament.smallBlindSeat = null;
        tournament.bigBlindSeat = null;
        tournament.actingSeat = null;
        tournament.availableActions = new ArrayList<>();
        return readyPlayers.size();
    }
}
