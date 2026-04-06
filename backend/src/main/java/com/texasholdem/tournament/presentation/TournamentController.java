package com.texasholdem.tournament.presentation;

import com.texasholdem.common.api.ApiResponse;
import com.texasholdem.tournament.application.TournamentService;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.presentation.dto.CreateTournamentRequest;
import com.texasholdem.tournament.presentation.dto.JoinTournamentRequest;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import com.texasholdem.tournament.presentation.dto.TournamentStartMessage;
import jakarta.validation.Valid;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/tournaments")
public class TournamentController {

    private final TournamentService tournamentService;

    // Wires tournament REST endpoints to the application service.
    public TournamentController(TournamentService tournamentService) {
        this.tournamentService = tournamentService;
    }

    // Creates a waiting tournament snapshot for the owner.
    @PostMapping
    public ApiResponse<TournamentSnapshot> createTournament(@Valid @RequestBody CreateTournamentRequest request) {
        return ApiResponse.ok(tournamentService.createTournament(request.guestId(), request.nickname()));
    }

    // Returns the latest server snapshot for a tournament code.
    @GetMapping("/{code}")
    public ApiResponse<TournamentSnapshot> getTournament(@PathVariable String code) {
        return ApiResponse.ok(tournamentService.getTournament(code));
    }

    // Adds a guest to a waiting tournament seat.
    @PostMapping("/{code}/join")
    public ApiResponse<TournamentSnapshot> joinTournament(
            @PathVariable String code,
            @Valid @RequestBody JoinTournamentRequest request
    ) {
        return ApiResponse.ok(tournamentService.joinTournament(code, request.guestId(), request.nickname()));
    }

    // Mirrors the ready toggle as a REST endpoint for quick testing.
    @PostMapping("/{code}/ready")
    public ApiResponse<TournamentEvent> readyTournament(
            @PathVariable String code,
            @Valid @RequestBody TournamentReadyMessage request
    ) {
        return ApiResponse.ok(tournamentService.changeReady(code, request.guestId(), request.ready()));
    }

    // Starts the first hand when the owner promotes ready players into the field.
    @PostMapping("/{code}/start")
    public ApiResponse<TournamentEvent> startTournament(
            @PathVariable String code,
            @Valid @RequestBody TournamentStartMessage request
    ) {
        return ApiResponse.ok(tournamentService.startTournament(code, request.guestId()));
    }
}
