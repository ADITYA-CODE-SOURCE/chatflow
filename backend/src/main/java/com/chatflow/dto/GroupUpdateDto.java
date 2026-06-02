package com.chatflow.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class GroupUpdateDto {
    @Size(min = 2, max = 100, message = "Group name must be between 2 and 100 characters")
    private String name;
    private String description;
    private String avatarUrl;
}
