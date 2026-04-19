package com.chatflow.controller;

import com.chatflow.dto.ChatRoomDto;
import com.chatflow.dto.MessageDto;
import com.chatflow.dto.UserDto;
import com.chatflow.entity.Message;
import com.chatflow.entity.User;
import com.chatflow.security.UserPrincipal;
import com.chatflow.service.ChatService;
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
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        return ResponseEntity.ok(chatService.createGroupChat(
                request.get("name"),
                request.get("description"),
                user));
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

    @PostMapping("/{roomId}/messages")
    public ResponseEntity<MessageDto> sendMessage(
            @PathVariable UUID roomId,
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserPrincipal principal) {
        User user = principal.getUser();
        String content = request.getOrDefault("content", "");
        String messageTypeValue = request.getOrDefault("messageType", Message.MessageType.TEXT.name());
        Message.MessageType messageType = Message.MessageType.valueOf(messageTypeValue.toUpperCase());

        return ResponseEntity.ok(chatService.sendMessage(roomId, content, messageType, user));
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
    
    @GetMapping("/{roomId}/participants")
    public ResponseEntity<List<UserDto>> getParticipants(@PathVariable UUID roomId) {
        return ResponseEntity.ok(chatService.getParticipants(roomId));
    }
}
