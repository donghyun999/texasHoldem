package com.texasholdem.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TournamentStateJpaRepository extends JpaRepository<TournamentStateEntity, String> {
}
