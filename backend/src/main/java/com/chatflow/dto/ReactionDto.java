package com.chatflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReactionDto {
    private String emoji;
    private int count;
    private boolean reactedByCurrentUser;
    private List<String> userNames;
}
