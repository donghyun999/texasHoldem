package com.texasholdem.game.presentation;

import com.texasholdem.common.api.ApiResponse;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@Validated
@RestController
@RequestMapping("/api/v1")
public class GameStatusController {

    // Reports backend health for the frontend boot flow.
    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> status() {
        return ApiResponse.ok(Map.of(
                "service", "texas-holdem-backend",
                "status", "UP",
                "mode", "tournament-mvp",
                "timestamp", Instant.now().toString()
        ));
    }

    // Exposes the current REST and WebSocket contract in one place.
    @GetMapping("/contract")
    public ApiResponse<Map<String, Object>> contract() {
        return ApiResponse.ok(Map.of(
                "rest", Map.of(
                        "createGuest", "POST /api/v1/guests",
                        "createTournament", "POST /api/v1/tournaments",
                        "joinTournament", "POST /api/v1/tournaments/{code}/join",
                        "getTournament", "GET /api/v1/tournaments/{code}"
                ),
                "websocket", Map.of(
                        "endpoint", "/ws",
                        "send", new String[]{
                                "/app/tournament.ready",
                                "/app/tournament.start",
                                "/app/game.action"
                        },
                        "subscribe", "/topic/tournament.{code}"
                )
        ));
    }
}
