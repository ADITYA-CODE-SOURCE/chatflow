package com.chatflow.dto;

import com.chatflow.entity.Message;
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
public class MessageDto {
    private UUID id;
    private UUID chatRoomId;
    private UUID senderId;
    private String senderName;
    private String senderAvatarUrl;
    private String content;
    private Message.MessageType messageType;
    private String attachmentUrl;
    private Instant createdAt;
    private boolean isRead;
    private UUID replyToMessageId;
    private String replyToSenderName;
    private String replyToContent;
    private Instant editedAt;
    private boolean deleted;
    private int readByCount;
    private java.util.List<String> seenByNames;
}
