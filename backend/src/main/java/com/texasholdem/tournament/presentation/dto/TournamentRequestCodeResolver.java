package com.texasholdem.tournament.presentation.dto;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class TournamentRequestCodeResolver {

    private TournamentRequestCodeResolver() {
    }

    // Resolves one tournament code from either the request body or the REST path variable.
    static String resolve(String requestCode, String fallbackCode) {
        var normalizedRequestCode = normalize(requestCode);
        var normalizedFallbackCode = normalize(fallbackCode);
        if (normalizedRequestCode.isBlank() && normalizedFallbackCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament code is required");
        }
        if (!normalizedRequestCode.isBlank() && !normalizedFallbackCode.isBlank()
                && !normalizedRequestCode.equals(normalizedFallbackCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament code mismatch");
        }
        return normalizedRequestCode.isBlank() ? normalizedFallbackCode : normalizedRequestCode;
    }

    private static String normalize(String code) {
        return code == null ? "" : code.trim().toUpperCase();
    }
}
