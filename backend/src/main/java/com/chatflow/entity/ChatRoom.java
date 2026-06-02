package com.chatflow.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_rooms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRoom {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(length = 100)
    private String name;
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(name = "invite_code", unique = true, length = 32)
    private String inviteCode;

    @Column(name = "invite_code_expires_at")
    private Instant inviteCodeExpiresAt;

    @Column(name = "pinned_message_id")
    private UUID pinnedMessageId;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "room_type", nullable = false)
    private RoomType roomType;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;
    
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();

        if (roomType == RoomType.GROUP && (inviteCode == null || inviteCode.isBlank())) {
            inviteCode = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        }
        if (roomType == RoomType.GROUP && inviteCodeExpiresAt == null) {
            inviteCodeExpiresAt = Instant.now().plusSeconds(60L * 60 * 24 * 30);
        }
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
    
    public enum RoomType {
        DIRECT, GROUP
    }
}
