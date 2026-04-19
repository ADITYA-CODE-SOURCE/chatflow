package com.chatflow.dto;

import com.chatflow.entity.ChatRoom;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
public class ChatRoomDto {
    private UUID id;
    private String name;
    private String description;
    private String avatarUrl;
    private ChatRoom.RoomType roomType;
    private UUID createdBy;
    private String createdByName;
    private Instant createdAt;
    private int unreadCount;
    private MessageDto lastMessage;
}
