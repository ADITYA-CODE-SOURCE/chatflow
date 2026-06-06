package com.chatflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "chat_participants",
        uniqueConstraints = @UniqueConstraint(columnNames = {"chat_room_id", "user_id"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatParticipant {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chat_room_id", nullable = false)
    private ChatRoom chatRoom;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;
    
    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;
    
    @Column(name = "last_read_message_id")
    private UUID lastReadMessageId;

    @Column(name = "notifications_muted")
    private boolean notificationsMuted;
    
    @PrePersist
    protected void onCreate() {
        joinedAt = Instant.now();
    }
    
    public enum Role {
        OWNER, ADMIN, MEMBER
    }
}
