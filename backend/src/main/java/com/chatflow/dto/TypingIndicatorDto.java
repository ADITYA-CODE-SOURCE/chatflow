package com.chatflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TypingIndicatorDto {
    private UUID chatRoomId;
    private UUID userId;
    private String userName;
    private boolean typing;
}
