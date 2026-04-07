package com.texasholdem.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "tournament_state")
public class TournamentStateEntity {

    @Id
    @Column(nullable = false, length = 16)
    private String code;

    @Lob
    @Column(nullable = false, columnDefinition = "text")
    private String payload;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    // Keeps JPA compatible construction available for entity hydration.
    protected TournamentStateEntity() {
    }

    // Stores one serialized tournament aggregate in the persistence layer.
    public TournamentStateEntity(String code, String payload) {
        this.code = code;
        this.payload = payload;
        this.updatedAt = LocalDateTime.now();
    }

    // Returns the stable tournament code used as the persistence key.
    public String getCode() {
        return code;
    }

    // Returns the serialized tournament payload snapshot.
    public String getPayload() {
        return payload;
    }

    // Returns when the latest payload snapshot was stored.
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    // Refreshes the update timestamp for both insert and update writes.
    @PrePersist
    @PreUpdate
    void touchUpdatedAt() {
        updatedAt = LocalDateTime.now();
    }
}
