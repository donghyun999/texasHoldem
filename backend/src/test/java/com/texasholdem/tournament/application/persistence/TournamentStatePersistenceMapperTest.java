package com.texasholdem.tournament.application.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TournamentStatePersistenceMapperTest {

    @Test
    void readHandlesLegacyPayloadWithNullCollectionsAndGuestId() {
        var mapper = new TournamentStatePersistenceMapper(new ObjectMapper(), new com.texasholdem.tournament.application.state.TournamentRules());

        var tournament = mapper.read("""
                {
                  "code": "LEGACY1",
                  "roomName": "Legacy Room",
                  "status": "WAITING",
                  "sidePots": null,
                  "boardCards": null,
                  "hiddenBoardCards": null,
                  "players": [
                    {
                      "guestId": null,
                      "nickname": "LegacyOwner",
                      "seatIndex": 0,
                      "stack": 0,
                      "status": "SEATED",
                      "owner": true,
                      "connected": true,
                      "participating": false,
                      "acting": false,
                      "totalContribution": 0,
                      "roundContribution": 0,
                      "awaitingAction": false,
                      "raiseRightsAvailable": null,
                      "afk": null,
                      "holeCards": null
                    }
                  ],
                  "showdownPots": null,
                  "showdownHands": null,
                  "recentlyBustedGuestIds": null,
                  "availableActions": null,
                  "tableMessage": "legacy"
                }
                """);

        assertThat(tournament.code).isEqualTo("LEGACY1");
        assertThat(tournament.players).hasSize(1);
        assertThat(tournament.players.get(0).guestId).isNull();
        assertThat(tournament.players.get(0).holeCards).isEmpty();
        assertThat(tournament.sidePots).isEmpty();
        assertThat(tournament.boardCards).isEmpty();
        assertThat(tournament.hiddenBoardCards).isEmpty();
        assertThat(tournament.showdownPots).isEmpty();
        assertThat(tournament.showdownHands).isEmpty();
        assertThat(tournament.recentlyBustedGuestIds).isEmpty();
        assertThat(tournament.availableActions).isEmpty();
    }

    @Test
    void readHandlesLegacyPayloadWithNullPlayersList() {
        var mapper = new TournamentStatePersistenceMapper(new ObjectMapper(), new com.texasholdem.tournament.application.state.TournamentRules());

        var tournament = mapper.read("""
                {
                  "code": "LEGACY2",
                  "roomName": "Legacy Room 2",
                  "status": "WAITING",
                  "players": null,
                  "sidePots": null,
                  "boardCards": null,
                  "hiddenBoardCards": null,
                  "showdownPots": null,
                  "availableActions": null
                }
                """);

        assertThat(tournament.code).isEqualTo("LEGACY2");
        assertThat(tournament.players).isEmpty();
        assertThat(tournament.sidePots).isEmpty();
        assertThat(tournament.availableActions).isEmpty();
    }
}
