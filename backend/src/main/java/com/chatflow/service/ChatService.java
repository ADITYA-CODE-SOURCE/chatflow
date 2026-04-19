package com.chatflow.service;

import com.chatflow.dto.ChatRoomDto;
import com.chatflow.dto.MessageDto;
import com.chatflow.dto.TypingIndicatorDto;
import com.chatflow.dto.UserDto;
import com.chatflow.entity.*;
import com.chatflow.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {
    
    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    
    @Transactional
    public ChatRoomDto createGroupChat(String name, String description, User creator) {
        ChatRoom room = ChatRoom.builder()
                .name(name)
                .description(description)
                .roomType(ChatRoom.RoomType.GROUP)
                .createdBy(creator)
                .build();
        
        room = chatRoomRepository.save(room);
        
        ChatParticipant participant = ChatParticipant.builder()
                .chatRoom(room)
                .user(creator)
                .role(ChatParticipant.Role.OWNER)
                .build();
        
        chatParticipantRepository.save(participant);
        
        return mapToDto(room, creator);
    }
    
    @Transactional
    public ChatRoomDto createDirectChat(User user1, User user2) {
        return chatRoomRepository.findDirectRoom(user1, user2)
                .map(room -> mapToDto(room, user2))
                .orElseGet(() -> {
                    ChatRoom room = ChatRoom.builder()
                            .roomType(ChatRoom.RoomType.DIRECT)
                            .createdBy(user1)
                            .build();
                    
                    room = chatRoomRepository.save(room);
                    
                    chatParticipantRepository.save(ChatParticipant.builder()
                            .chatRoom(room)
                            .user(user1)
                            .role(ChatParticipant.Role.MEMBER)
                            .build());
                    
                    chatParticipantRepository.save(ChatParticipant.builder()
                            .chatRoom(room)
                            .user(user2)
                            .role(ChatParticipant.Role.MEMBER)
                            .build());
                    
                    return mapToDto(room, user2);
                });
    }
    
    @Transactional(readOnly = true)
    public List<ChatRoomDto> getUserChatRooms(User user) {
        List<ChatRoom> rooms = chatRoomRepository.findByUser(user);
        
        return rooms.stream()
                .map(room -> {
                    User otherUser = getOtherParticipant(room, user);
                    return mapToDto(room, otherUser);
                })
                .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public ChatRoomDto getChatRoom(UUID roomId, User user) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
        
        if (!chatParticipantRepository.existsByChatRoomAndUser(room, user)) {
            throw new RuntimeException("Not a participant of this chat room");
        }
        
        User otherUser = room.getRoomType() == ChatRoom.RoomType.DIRECT 
                ? getOtherParticipant(room, user) 
                : null;
        
        return mapToDto(room, otherUser);
    }
    
    @Transactional
    public MessageDto sendMessage(UUID roomId, String content, Message.MessageType messageType, User sender) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
        
        if (!chatParticipantRepository.existsByChatRoomAndUser(room, sender)) {
            throw new RuntimeException("Not a participant of this chat room");
        }
        
        Message message = Message.builder()
                .chatRoom(room)
                .sender(sender)
                .content(content)
                .messageType(messageType)
                .build();
        
        message = messageRepository.save(message);
        
        MessageDto messageDto = mapMessageToDto(message);
        
        messagingTemplate.convertAndSend("/topic/chat/" + roomId, messageDto);
        
        return messageDto;
    }

    @Transactional(readOnly = true)
    public void sendTypingIndicator(UUID roomId, User user, boolean typing) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));

        if (!chatParticipantRepository.existsByChatRoomAndUser(room, user)) {
            throw new RuntimeException("Not a participant of this chat room");
        }

        TypingIndicatorDto typingIndicator = TypingIndicatorDto.builder()
                .chatRoomId(roomId)
                .userId(user.getId())
                .userName(user.getDisplayName())
                .typing(typing)
                .build();

        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/typing", typingIndicator);
    }
    
    @Transactional(readOnly = true)
    public Page<MessageDto> getMessages(UUID roomId, int page, int size, User user) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
        
        if (!chatParticipantRepository.existsByChatRoomAndUser(room, user)) {
            throw new RuntimeException("Not a participant of this chat room");
        }
        
        Page<Message> messages = messageRepository.findByChatRoomIdOrderByCreatedAtDesc(
                roomId, PageRequest.of(page, size));
        
        return messages.map(this::mapMessageToDto);
    }
    
    @Transactional(readOnly = true)
    public List<UserDto> getParticipants(UUID roomId) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
        
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        
        return participants.stream()
                .map(cp -> mapUserToDto(cp.getUser()))
                .collect(Collectors.toList());
    }
    
    private User getOtherParticipant(ChatRoom room, User currentUser) {
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        return participants.stream()
                .map(ChatParticipant::getUser)
                .filter(u -> !u.getId().equals(currentUser.getId()))
                .findFirst()
                .orElse(null);
    }
    
    private ChatRoomDto mapToDto(ChatRoom room, User otherUser) {
        ChatRoomDto dto = ChatRoomDto.builder()
                .id(room.getId())
                .name(room.getName())
                .description(room.getDescription())
                .avatarUrl(room.getAvatarUrl())
                .roomType(room.getRoomType())
                .createdBy(room.getCreatedBy().getId())
                .createdByName(room.getCreatedBy().getDisplayName())
                .createdAt(room.getCreatedAt())
                .build();
        
        if (room.getRoomType() == ChatRoom.RoomType.DIRECT && otherUser != null) {
            dto.setName(otherUser.getDisplayName());
            dto.setAvatarUrl(otherUser.getAvatarUrl());
        }
        
        return dto;
    }
    
    private MessageDto mapMessageToDto(Message message) {
        return MessageDto.builder()
                .id(message.getId())
                .chatRoomId(message.getChatRoom().getId())
                .senderId(message.getSender().getId())
                .senderName(message.getSender().getDisplayName())
                .senderAvatarUrl(message.getSender().getAvatarUrl())
                .content(message.getContent())
                .messageType(message.getMessageType())
                .attachmentUrl(message.getAttachmentUrl())
                .createdAt(message.getCreatedAt())
                .build();
    }
    
    private UserDto mapUserToDto(User user) {
        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .displayName(user.getDisplayName())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
