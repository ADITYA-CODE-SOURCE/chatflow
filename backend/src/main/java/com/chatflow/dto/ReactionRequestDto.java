package com.chatflow.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ReactionRequestDto {
    @NotBlank(message = "Emoji is required")
    private String emoji;
}
