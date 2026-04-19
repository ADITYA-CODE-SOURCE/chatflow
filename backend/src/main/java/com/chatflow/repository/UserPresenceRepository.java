package com.chatflow.repository;

import com.chatflow.entity.UserPresence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface UserPresenceRepository extends JpaRepository<UserPresence, UUID> {
    UserPresence findByUserId(UUID userId);
}
