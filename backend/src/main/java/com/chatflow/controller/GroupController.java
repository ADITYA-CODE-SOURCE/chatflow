package com.chatflow.controller;

import com.chatflow.dto.ChatRoomDto;
import com.chatflow.dto.GroupInviteDto;
import com.chatflow.security.UserPrincipal;
import com.chatflow.service.ChatService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/groups")
public class GroupController {

    private final ChatService chatService;

    public GroupController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/{groupId}/invite")
    public ResponseEntity<GroupInviteDto> getInvite(
            @PathVariable UUID groupId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.getGroupInvite(groupId, principal.getUser()));
    }

    @PostMapping("/{groupId}/regenerate-invite")
    public ResponseEntity<GroupInviteDto> regenerateInvite(
            @PathVariable UUID groupId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.regenerateInvite(groupId, principal.getUser()));
    }

    @PostMapping("/join/{inviteCode}")
    public ResponseEntity<ChatRoomDto> joinByInvite(
            @PathVariable String inviteCode,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.joinGroupByInviteCode(principal.getUser(), inviteCode));
    }
}
