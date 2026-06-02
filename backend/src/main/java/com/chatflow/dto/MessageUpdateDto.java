package com.chatflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MessageUpdateDto {
    @NotBlank(message = "Message content is required")
    @Size(max = 4000, message = "Message is too long")
    private String content;
}
