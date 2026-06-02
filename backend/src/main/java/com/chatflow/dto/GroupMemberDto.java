package com.chatflow.dto;

import com.chatflow.entity.ChatParticipant;
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
public class GroupMemberDto {
    private UUID userId;
    private String displayName;
    private String email;
    private String avatarUrl;
    private ChatParticipant.Role role;
    private Instant joinedAt;
}
