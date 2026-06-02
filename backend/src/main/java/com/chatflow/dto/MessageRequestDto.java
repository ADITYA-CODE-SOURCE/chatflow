package com.chatflow.dto;

import com.chatflow.entity.Message;
import lombok.Data;

import java.util.UUID;

@Data
public class MessageRequestDto {
    private String content;
    private Message.MessageType messageType;
    private String attachmentUrl;
    private UUID replyToMessageId;
}
