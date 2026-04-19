package com.chatflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_presence")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPresence {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;
    
    @Column(name = "is_online", nullable = false)
    private boolean isOnline;
    
    @Column(name = "last_seen", nullable = false)
    private Instant lastSeen;
    
    public void updatePresence(boolean online) {
        this.isOnline = online;
        this.lastSeen = Instant.now();
    }
}
