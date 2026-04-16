package com.texasholdem.tournament.presentation;

import com.texasholdem.auth.GuestSessionResolver;
import com.texasholdem.common.api.ApiResponse;
import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.presentation.dto.CreateGuestRequest;
import jakarta.servlet.http.HttpServletRequest;
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
@RequestMapping("/api/v1/guests")
public class GuestController {

    private final TournamentService tournamentService;
    private final GuestSessionResolver guestSessionResolver;

    // Wires the guest API to the tournament application service.
    public GuestController(TournamentService tournamentService, GuestSessionResolver guestSessionResolver) {
        this.tournamentService = tournamentService;
        this.guestSessionResolver = guestSessionResolver;
    }

    // Creates a guest identity that the client can persist locally.
    @PostMapping
    public ApiResponse<GuestSession> createGuest(@Valid @RequestBody CreateGuestRequest request, HttpServletRequest httpRequest) {
        var guestSession = tournamentService.registerGuest(request.nickname());
        guestSessionResolver.establishGuestSession(httpRequest, guestSession);
        return ApiResponse.ok(guestSession);
    }

    // Returns the current active tournament for the session-backed guest identity.
    @GetMapping("/me/active-tournament")
    public ApiResponse<ActiveTournamentSession> getMyActiveTournament(HttpServletRequest httpRequest) {
        return ApiResponse.ok(tournamentService.findActiveTournament(guestSessionResolver.requireGuestId(httpRequest)));
    }

    // Returns the current active tournament already occupied by the guest, when one exists.
    @GetMapping("/{guestId}/active-tournament")
    public ApiResponse<ActiveTournamentSession> getActiveTournament(@PathVariable String guestId) {
        return ApiResponse.ok(tournamentService.findActiveTournament(guestId));
    }
}
