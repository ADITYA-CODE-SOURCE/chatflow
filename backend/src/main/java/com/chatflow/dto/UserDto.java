package com.chatflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDto {
    private UUID id;
    private String email;
    private String displayName;
    private String avatarUrl;
    private String bio;
    private Instant createdAt;
    private boolean isOnline;
    private Instant lastSeen;
}
