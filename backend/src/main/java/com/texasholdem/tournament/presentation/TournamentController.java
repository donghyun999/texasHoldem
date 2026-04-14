package com.texasholdem.tournament.presentation;

import com.texasholdem.common.api.ApiResponse;
import com.texasholdem.tournament.application.TournamentService;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.presentation.dto.CreateTournamentRequest;
import com.texasholdem.tournament.presentation.dto.JoinTournamentRequest;
import com.texasholdem.tournament.presentation.dto.TournamentConnectionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import com.texasholdem.tournament.presentation.dto.TournamentStartMessage;
import com.texasholdem.websocket.TournamentTopicPublisher;
import jakarta.validation.Valid;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/tournaments")
public class TournamentController {

    private final TournamentService tournamentService;
    private final TournamentTopicPublisher topicPublisher;

    // Wires tournament REST endpoints to the application service.
    public TournamentController(TournamentService tournamentService, TournamentTopicPublisher topicPublisher) {
        this.tournamentService = tournamentService;
        this.topicPublisher = topicPublisher;
    }

    // Creates a waiting tournament snapshot for the owner.
    @PostMapping
    public ApiResponse<TournamentSnapshot> createTournament(@Valid @RequestBody CreateTournamentRequest request) {
        return ApiResponse.ok(tournamentService.createTournament(request.guestId(), request.nickname(), request.code()));
    }

    // Returns the latest server snapshot for a tournament code.
    @GetMapping("/{code}")
    public ApiResponse<TournamentSnapshot> getTournament(
            @PathVariable String code,
            @RequestParam(required = false) String guestId
    ) {
        return ApiResponse.ok(tournamentService.getTournament(code, guestId));
    }

    // Adds a guest to a waiting tournament seat.
    @PostMapping("/{code}/join")
    public ApiResponse<TournamentSnapshot> joinTournament(
            @PathVariable String code,
            @Valid @RequestBody JoinTournamentRequest request
    ) {
        var broadcast = tournamentService.joinTournamentBroadcast(code, request.guestId(), request.nickname());
        topicPublisher.publish(code, broadcast);
        return ApiResponse.ok(broadcast.primaryEvent().snapshot());
    }

    // Mirrors the ready toggle as a REST endpoint for quick testing.
    @PostMapping("/{code}/ready")
    public ApiResponse<TournamentEvent> readyTournament(
            @PathVariable String code,
            @Valid @RequestBody TournamentReadyMessage request
    ) {
        return ApiResponse.ok(
                tournamentService.changeReady(request.resolveCode(code), request.guestId(), request.ready()).primaryEvent()
        );
    }

    // Removes or marks a player disconnected according to the current tournament state.
    @PostMapping("/{code}/disconnect")
    public ApiResponse<TournamentEvent> disconnectTournamentPlayer(
            @PathVariable String code,
            @Valid @RequestBody TournamentConnectionMessage request
    ) {
        return ApiResponse.ok(tournamentService.disconnectPlayer(request.resolveCode(code), request.guestId()).primaryEvent());
    }

    // Restores a previously disconnected player's seat and latest snapshot.
    @PostMapping("/{code}/reconnect")
    public ApiResponse<TournamentEvent> reconnectTournamentPlayer(
            @PathVariable String code,
            @Valid @RequestBody TournamentConnectionMessage request
    ) {
        return ApiResponse.ok(tournamentService.reconnectPlayer(request.resolveCode(code), request.guestId()).primaryEvent());
    }

    // Restores an AFK player to normal turn control for future actions.
    @PostMapping("/{code}/return-to-play")
    public ApiResponse<TournamentEvent> returnAfkPlayerToPlay(
            @PathVariable String code,
            @Valid @RequestBody TournamentConnectionMessage request
    ) {
        return ApiResponse.ok(tournamentService.returnPlayerToPlay(request.resolveCode(code), request.guestId()).primaryEvent());
    }

    // Starts the first hand when the owner promotes ready players into the field.
    @PostMapping("/{code}/start")
    public ApiResponse<TournamentEvent> startTournament(
            @PathVariable String code,
            @Valid @RequestBody TournamentStartMessage request
    ) {
        return ApiResponse.ok(tournamentService.startTournament(request.resolveCode(code), request.guestId()).primaryEvent());
    }
}
