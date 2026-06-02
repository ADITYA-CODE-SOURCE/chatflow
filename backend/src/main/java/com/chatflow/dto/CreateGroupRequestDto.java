package com.chatflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateGroupRequestDto {
    @NotBlank(message = "Group name is required")
    @Size(min = 2, max = 100, message = "Group name must be between 2 and 100 characters")
    private String name;

    @Size(max = 1000, message = "Description must be 1000 characters or fewer")
    private String description;

    @Size(max = 2000, message = "Avatar URL is too long")
    private String avatarUrl;
}
