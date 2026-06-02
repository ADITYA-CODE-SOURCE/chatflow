package com.chatflow.controller;

import com.chatflow.dto.ChatRoomDto;
import com.chatflow.dto.CreateGroupRequestDto;
import com.chatflow.dto.GroupMemberDto;
import com.chatflow.dto.GroupUpdateDto;
import com.chatflow.dto.MessageDto;
import com.chatflow.dto.MessageRequestDto;
import com.chatflow.dto.MessageUpdateDto;
import com.chatflow.dto.MuteRequestDto;
import com.chatflow.dto.PinMessageRequestDto;
import com.chatflow.dto.UserDto;
import com.chatflow.entity.Message;
import com.chatflow.entity.User;
import com.chatflow.security.UserPrincipal;
import com.chatflow.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat-rooms")
@RequiredArgsConstructor
public class ChatController {
    
    private final ChatService chatService;
    
    @GetMapping
    public ResponseEntity<List<ChatRoomDto>> getChatRooms(@AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        return ResponseEntity.ok(chatService.getUserChatRooms(user));
    }
    
    @PostMapping
    public ResponseEntity<ChatRoomDto> createGroupChat(
            @Valid @RequestBody CreateGroupRequestDto request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        return ResponseEntity.ok(chatService.createGroupChat(
                request.getName(),
                request.getDescription(),
                request.getAvatarUrl(),
                user));
    }

    @PostMapping("/direct")
    public ResponseEntity<ChatRoomDto> createOrGetDirectChat(
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        String otherUserId = request.get("userId");
        return ResponseEntity.ok(chatService.createOrGetDirectChat(user, UUID.fromString(otherUserId)));
    }

    @PostMapping("/join")
    public ResponseEntity<ChatRoomDto> joinGroupByInvite(
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(chatService.joinGroupByInviteCode(principal.getUser(), request.get("inviteCode")));
    }
    
    @GetMapping("/{roomId}")
    public ResponseEntity<ChatRoomDto> getChatRoom(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        return ResponseEntity.ok(chatService.getChatRoom(roomId, user));
    }
    
    @GetMapping("/{roomId}/messages")
    public ResponseEntity<Page<MessageDto>> getMessages(
            @PathVariable UUID roomId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        return ResponseEntity.ok(chatService.getMessages(roomId, page, size, user));
    }

    @GetMapping("/{roomId}/messages/search")
    public ResponseEntity<List<MessageDto>> searchMessages(
            @PathVariable UUID roomId,
            @RequestParam(name = "q", defaultValue = "") String query,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.searchMessages(roomId, query, principal.getUser()));
    }

    @PostMapping("/{roomId}/messages")
    public ResponseEntity<MessageDto> sendMessage(
            @PathVariable UUID roomId,
            @RequestBody MessageRequestDto request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        String content = request.getContent() == null ? "" : request.getContent();
        String messageTypeValue = request.getMessageType() == null ? Message.MessageType.TEXT.name() : request.getMessageType().name();
        String attachmentUrl = request.getAttachmentUrl();
        Message.MessageType messageType = Message.MessageType.valueOf(messageTypeValue.toUpperCase());

        return ResponseEntity.ok(chatService.sendMessage(roomId, content, messageType, attachmentUrl, request.getReplyToMessageId(), user));
    }

    @PutMapping("/{roomId}/messages/{messageId}")
    public ResponseEntity<MessageDto> updateMessage(
            @PathVariable UUID roomId,
            @PathVariable UUID messageId,
            @Valid @RequestBody MessageUpdateDto request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.updateMessage(roomId, messageId, request.getContent(), principal.getUser()));
    }

    @DeleteMapping("/{roomId}/messages/{messageId}")
    public ResponseEntity<MessageDto> deleteMessage(
            @PathVariable UUID roomId,
            @PathVariable UUID messageId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.deleteMessage(roomId, messageId, principal.getUser()));
    }

    @PostMapping("/{roomId}/typing")
    public ResponseEntity<Void> sendTypingIndicator(
            @PathVariable UUID roomId,
            @RequestBody Map<String, Boolean> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        boolean typing = request.getOrDefault("typing", false);
        chatService.sendTypingIndicator(roomId, user, typing);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{roomId}/read")
    public ResponseEntity<Void> markRoomAsRead(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal) {
        chatService.markRoomAsRead(roomId, principal.getUser());
        return ResponseEntity.ok().build();
    }
    
    @GetMapping("/{roomId}/participants")
    public ResponseEntity<List<UserDto>> getParticipants(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.getParticipants(roomId, principal.getUser()));
    }

    @GetMapping("/{roomId}/members")
    public ResponseEntity<List<GroupMemberDto>> getGroupMembers(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.getGroupMembers(roomId, principal.getUser()));
    }

    @PutMapping("/{roomId}")
    public ResponseEntity<ChatRoomDto> updateGroup(
            @PathVariable UUID roomId,
            @Valid @RequestBody GroupUpdateDto request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.updateGroup(roomId, request, principal.getUser()));
    }

    @PostMapping("/{roomId}/leave")
    public ResponseEntity<Void> leaveGroup(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.leaveGroup(roomId, principal.getUser());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{roomId}/members")
    public ResponseEntity<Void> addMember(
            @PathVariable UUID roomId,
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.addMember(roomId, UUID.fromString(request.get("userId")), principal.getUser());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{roomId}/members/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable UUID roomId,
            @PathVariable UUID userId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.removeMember(roomId, userId, principal.getUser());
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{roomId}/admins/{userId}")
    public ResponseEntity<Void> promote(
            @PathVariable UUID roomId,
            @PathVariable UUID userId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.promoteToAdmin(roomId, userId, principal.getUser());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{roomId}/admins/{userId}")
    public ResponseEntity<Void> demote(
            @PathVariable UUID roomId,
            @PathVariable UUID userId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.demoteToMember(roomId, userId, principal.getUser());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{roomId}")
    public ResponseEntity<Void> deleteGroup(
            @PathVariable UUID roomId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        chatService.deleteGroup(roomId, principal.getUser());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{roomId}/mute")
    public ResponseEntity<ChatRoomDto> setMuted(
            @PathVariable UUID roomId,
            @RequestBody MuteRequestDto request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.setMuted(roomId, principal.getUser(), request.isMuted()));
    }

    @PutMapping("/{roomId}/pin")
    public ResponseEntity<ChatRoomDto> pinMessage(
            @PathVariable UUID roomId,
            @RequestBody PinMessageRequestDto request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(chatService.pinMessage(roomId, request.getMessageId(), principal.getUser()));
    }
}
