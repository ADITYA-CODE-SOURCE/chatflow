package com.chatflow.service;

import com.chatflow.dto.*;
import com.chatflow.entity.ChatParticipant;
import com.chatflow.entity.ChatRoom;
import com.chatflow.entity.Message;
import com.chatflow.entity.User;
import com.chatflow.entity.UserPresence;
import com.chatflow.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatRoomRepository chatRoomRepository;
    private final ChatParticipantRepository chatParticipantRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final UserPresenceRepository userPresenceRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    private ChatRoom requireRoom(UUID roomId) {
        return chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new RuntimeException("Chat room not found"));
    }

    private ChatParticipant requireParticipant(ChatRoom room, User user) {
        return chatParticipantRepository.findByChatRoomAndUser(room, user)
                .orElseThrow(() -> new RuntimeException("Not a participant of this chat room"));
    }

    private ChatParticipant requireAdmin(ChatRoom room, User user) {
        ChatParticipant participant = requireParticipant(room, user);
        if (participant.getRole() != ChatParticipant.Role.OWNER && participant.getRole() != ChatParticipant.Role.ADMIN) {
            throw new RuntimeException("Admin permissions required");
        }
        return participant;
    }

    private ChatParticipant requireOwnerParticipant(ChatRoom room, User user) {
        ChatParticipant participant = requireParticipant(room, user);
        if (participant.getRole() != ChatParticipant.Role.OWNER) {
            throw new RuntimeException("Owner permissions required");
        }
        return participant;
    }

    private void requireGroup(ChatRoom room) {
        if (room.getRoomType() != ChatRoom.RoomType.GROUP) {
            throw new RuntimeException("Not a group chat");
        }
    }

    private String generateUniqueInviteCode() {
        for (int i = 0; i < 10; i++) {
            String candidate = UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
            if (chatRoomRepository.findByInviteCode(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new RuntimeException("Failed to generate invite code");
    }

    private GroupInviteDto toInviteDto(ChatRoom room) {
        return GroupInviteDto.builder()
                .groupId(room.getId())
                .inviteCode(room.getInviteCode())
                .inviteLink(frontendUrl + "/join/" + room.getInviteCode())
                .expiresAt(room.getInviteCodeExpiresAt())
                .build();
    }

    private Message createSystemMessage(ChatRoom room, User actor, String content) {
        Message message = Message.builder()
                .chatRoom(room)
                .sender(actor)
                .content(content)
                .messageType(Message.MessageType.SYSTEM)
                .build();
        return messageRepository.save(message);
    }

    private void broadcastMessage(ChatRoom room, Message message) {
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        messagingTemplate.convertAndSend("/topic/chat/" + room.getId(), mapMessageToDto(message, participants, null));
    }

    private void emitRoomDeleted(UUID roomId) {
        messagingTemplate.convertAndSend("/topic/groups/deleted", Map.of("roomId", roomId.toString()));
    }

    private void emitRoomUpdated(ChatRoom room, User actor) {
        messagingTemplate.convertAndSend("/topic/chat/" + room.getId() + "/room-updated", mapToDto(room, actor, getOtherParticipant(room, actor)));
    }

    @Transactional
    public ChatRoomDto createGroupChat(String name, String description, String avatarUrl, User creator) {
        if (name == null || name.isBlank()) {
            throw new RuntimeException("Group name is required");
        }

        String normalizedName = name.trim();
        if (normalizedName.length() < 2 || normalizedName.length() > 100) {
            throw new RuntimeException("Group name must be between 2 and 100 characters");
        }

        String normalizedDescription = description == null ? null : description.trim();
        if (normalizedDescription != null && normalizedDescription.isBlank()) {
            normalizedDescription = null;
        }

        String normalizedAvatarUrl = avatarUrl == null ? null : avatarUrl.trim();
        if (normalizedAvatarUrl != null && normalizedAvatarUrl.isBlank()) {
            normalizedAvatarUrl = null;
        }

        ChatRoom room = ChatRoom.builder()
                .name(normalizedName)
                .description(normalizedDescription)
                .avatarUrl(normalizedAvatarUrl)
                .roomType(ChatRoom.RoomType.GROUP)
                .createdBy(creator)
                .inviteCode(generateUniqueInviteCode())
                .inviteCodeExpiresAt(Instant.now().plusSeconds(60L * 60 * 24 * 30))
                .build();

        room = chatRoomRepository.save(room);

        chatParticipantRepository.save(ChatParticipant.builder()
                .chatRoom(room)
                .user(creator)
                .role(ChatParticipant.Role.OWNER)
                .notificationsMuted(false)
                .build());

        broadcastMessage(room, createSystemMessage(room, creator, creator.getDisplayName() + " created the group"));
        return mapToDto(room, creator, null);
    }

    @Transactional
    public ChatRoomDto createDirectChat(User user1, User user2) {
        return chatRoomRepository.findDirectRoom(user1, user2)
                .map(room -> mapToDto(room, user1, user2))
                .orElseGet(() -> {
                    ChatRoom room = ChatRoom.builder()
                            .roomType(ChatRoom.RoomType.DIRECT)
                            .createdBy(user1)
                            .build();

                    ChatRoom savedRoom = chatRoomRepository.save(room);

                    chatParticipantRepository.save(ChatParticipant.builder()
                            .chatRoom(savedRoom)
                            .user(user1)
                            .role(ChatParticipant.Role.MEMBER)
                            .notificationsMuted(false)
                            .build());

                    chatParticipantRepository.save(ChatParticipant.builder()
                            .chatRoom(savedRoom)
                            .user(user2)
                            .role(ChatParticipant.Role.MEMBER)
                            .notificationsMuted(false)
                            .build());

                    return mapToDto(savedRoom, user1, user2);
                });
    }

    @Transactional
    public ChatRoomDto createOrGetDirectChat(User currentUser, UUID otherUserId) {
        User otherUser = userRepository.findById(otherUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return createDirectChat(currentUser, otherUser);
    }

    @Transactional(readOnly = true)
    public GroupInviteDto getGroupInvite(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireParticipant(room, user);
        return toInviteDto(room);
    }

    @Transactional
    public GroupInviteDto regenerateInvite(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireAdmin(room, user);
        room.setInviteCode(generateUniqueInviteCode());
        room.setInviteCodeExpiresAt(Instant.now().plusSeconds(60L * 60 * 24 * 30));
        chatRoomRepository.save(room);
        emitRoomUpdated(room, user);
        return toInviteDto(room);
    }

    @Transactional
    public ChatRoomDto joinGroupByInviteCode(User user, String inviteCode) {
        if (inviteCode == null || inviteCode.isBlank()) {
            throw new RuntimeException("Invite code is required");
        }

        ChatRoom room = chatRoomRepository.findByInviteCode(inviteCode.trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> new RuntimeException("Invalid invite code"));
        requireGroup(room);

        if (room.getInviteCodeExpiresAt() != null && room.getInviteCodeExpiresAt().isBefore(Instant.now())) {
            throw new RuntimeException("Invite code has expired");
        }

        if (chatParticipantRepository.existsByChatRoomAndUser(room, user)) {
            return mapToDto(room, user, null);
        }

        chatParticipantRepository.save(ChatParticipant.builder()
                .chatRoom(room)
                .user(user)
                .role(ChatParticipant.Role.MEMBER)
                .notificationsMuted(false)
                .build());

        Message systemMessage = createSystemMessage(room, user, user.getDisplayName() + " joined using invite link");
        broadcastMessage(room, systemMessage);
        messagingTemplate.convertAndSend("/topic/chat/" + room.getId() + "/member-joined", Map.of(
                "userId", user.getId(),
                "displayName", user.getDisplayName()
        ));

        return mapToDto(room, user, null);
    }

    @Transactional
    public ChatRoomDto updateGroup(UUID roomId, GroupUpdateDto update, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireAdmin(room, user);

        if (update.getName() != null && !update.getName().isBlank()) {
            room.setName(update.getName().trim());
        }
        if (update.getDescription() != null) {
            room.setDescription(update.getDescription().trim());
        }
        if (update.getAvatarUrl() != null) {
            room.setAvatarUrl(update.getAvatarUrl().trim());
        }

        chatRoomRepository.save(room);
        emitRoomUpdated(room, user);
        return mapToDto(room, user, null);
    }

    @Transactional
    public void leaveGroup(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);

        ChatParticipant participant = requireParticipant(room, user);
        if (participant.getRole() == ChatParticipant.Role.OWNER) {
            throw new RuntimeException("Owner cannot leave. Transfer ownership or delete group.");
        }

        chatParticipantRepository.deleteByChatRoomAndUser(room, user);
        broadcastMessage(room, createSystemMessage(room, user, user.getDisplayName() + " left the group"));
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/member-left", Map.of(
                "userId", user.getId(),
                "displayName", user.getDisplayName()
        ));
    }

    @Transactional
    public void addMember(UUID roomId, UUID userIdToAdd, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireAdmin(room, actor);

        User userToAdd = userRepository.findById(userIdToAdd)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (chatParticipantRepository.existsByChatRoomAndUser(room, userToAdd)) {
            throw new RuntimeException("User is already a member");
        }

        chatParticipantRepository.save(ChatParticipant.builder()
                .chatRoom(room)
                .user(userToAdd)
                .role(ChatParticipant.Role.MEMBER)
                .notificationsMuted(false)
                .build());

        broadcastMessage(room, createSystemMessage(room, actor, actor.getDisplayName() + " added " + userToAdd.getDisplayName()));
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/member-added", Map.of(
                "userId", userToAdd.getId(),
                "displayName", userToAdd.getDisplayName()
        ));
    }

    @Transactional
    public void removeMember(UUID roomId, UUID userIdToRemove, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireAdmin(room, actor);

        User userToRemove = userRepository.findById(userIdToRemove)
                .orElseThrow(() -> new RuntimeException("User not found"));
        ChatParticipant participant = requireParticipant(room, userToRemove);
        if (participant.getRole() == ChatParticipant.Role.OWNER) {
            throw new RuntimeException("Cannot remove group owner");
        }

        chatParticipantRepository.deleteByChatRoomAndUser(room, userToRemove);
        broadcastMessage(room, createSystemMessage(room, actor, actor.getDisplayName() + " removed " + userToRemove.getDisplayName()));
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/member-removed", Map.of(
                "userId", userToRemove.getId(),
                "displayName", userToRemove.getDisplayName()
        ));
    }

    @Transactional
    public void promoteToAdmin(UUID roomId, UUID userId, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireOwnerParticipant(room, actor);

        User target = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        ChatParticipant participant = requireParticipant(room, target);
        if (participant.getRole() == ChatParticipant.Role.OWNER) {
            return;
        }
        participant.setRole(ChatParticipant.Role.ADMIN);
        chatParticipantRepository.save(participant);
        broadcastMessage(room, createSystemMessage(room, actor, actor.getDisplayName() + " promoted " + target.getDisplayName() + " to admin"));
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/role-updated", Map.of(
                "userId", target.getId(),
                "role", participant.getRole().name()
        ));
    }

    @Transactional
    public void demoteToMember(UUID roomId, UUID userId, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireOwnerParticipant(room, actor);

        User target = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        ChatParticipant participant = requireParticipant(room, target);
        if (participant.getRole() == ChatParticipant.Role.OWNER) {
            throw new RuntimeException("Cannot demote owner");
        }
        participant.setRole(ChatParticipant.Role.MEMBER);
        chatParticipantRepository.save(participant);
        broadcastMessage(room, createSystemMessage(room, actor, actor.getDisplayName() + " demoted " + target.getDisplayName()));
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/role-updated", Map.of(
                "userId", target.getId(),
                "role", participant.getRole().name()
        ));
    }

    @Transactional
    public void deleteGroup(UUID roomId, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireOwnerParticipant(room, actor);

        messageRepository.deleteByChatRoomId(roomId);
        chatParticipantRepository.deleteByChatRoomId(roomId);
        chatRoomRepository.delete(room);
        emitRoomDeleted(roomId);
    }

    @Transactional(readOnly = true)
    public List<GroupMemberDto> getGroupMembers(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireParticipant(room, user);

        return chatParticipantRepository.findByChatRoom(room).stream()
                .map(cp -> GroupMemberDto.builder()
                        .userId(cp.getUser().getId())
                        .displayName(cp.getUser().getDisplayName())
                        .email(cp.getUser().getEmail())
                        .avatarUrl(cp.getUser().getAvatarUrl())
                        .role(cp.getRole())
                        .joinedAt(cp.getJoinedAt())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ChatRoomDto> getUserChatRooms(User user) {
        return chatRoomRepository.findByUser(user).stream()
                .map(room -> mapToDto(room, user, getOtherParticipant(room, user)))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ChatRoomDto getChatRoom(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);
        return mapToDto(room, user, room.getRoomType() == ChatRoom.RoomType.DIRECT ? getOtherParticipant(room, user) : null);
    }

    @Transactional
    public MessageDto sendMessage(UUID roomId, String content, Message.MessageType messageType, String attachmentUrl, UUID replyToMessageId, User sender) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, sender);

        Message.MessageType finalType = messageType == null ? Message.MessageType.TEXT : messageType;
        String normalizedContent = content == null ? "" : content.trim();
        if (finalType == Message.MessageType.TEXT && normalizedContent.isBlank()) {
            throw new RuntimeException("Message content is required");
        }
        if (finalType == Message.MessageType.IMAGE && (attachmentUrl == null || attachmentUrl.isBlank())) {
            throw new RuntimeException("Image URL is required");
        }

        Message replyToMessage = null;
        if (replyToMessageId != null) {
            replyToMessage = messageRepository.findByIdAndChatRoomId(replyToMessageId, roomId)
                    .orElseThrow(() -> new RuntimeException("Reply target not found"));
        }

        Message message = Message.builder()
                .chatRoom(room)
                .sender(sender)
                .content(normalizedContent)
                .messageType(finalType)
                .attachmentUrl(attachmentUrl == null ? null : attachmentUrl.trim())
                .replyToMessage(replyToMessage)
                .build();

        Message saved = messageRepository.save(message);
        updateLastReadForSender(room, sender, saved.getId());

        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        MessageDto dto = mapMessageToDto(saved, participants, sender);
        messagingTemplate.convertAndSend("/topic/chat/" + roomId, dto);
        return dto;
    }

    @Transactional
    public MessageDto updateMessage(UUID roomId, UUID messageId, String content, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, actor);
        Message message = messageRepository.findByIdAndChatRoomId(messageId, roomId)
                .orElseThrow(() -> new RuntimeException("Message not found"));

        if (!message.getSender().getId().equals(actor.getId())) {
            throw new RuntimeException("You can only edit your own messages");
        }
        if (message.getMessageType() == Message.MessageType.SYSTEM) {
            throw new RuntimeException("System messages cannot be edited");
        }
        if (message.getDeletedAt() != null) {
            throw new RuntimeException("Deleted messages cannot be edited");
        }

        String normalized = content == null ? "" : content.trim();
        if (normalized.isBlank()) {
            throw new RuntimeException("Message content is required");
        }

        message.setContent(normalized);
        message.setEditedAt(Instant.now());
        Message saved = messageRepository.save(message);
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        MessageDto dto = mapMessageToDto(saved, participants, actor);
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/message-updated", dto);
        return dto;
    }

    @Transactional
    public MessageDto deleteMessage(UUID roomId, UUID messageId, User actor) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, actor);
        Message message = messageRepository.findByIdAndChatRoomId(messageId, roomId)
                .orElseThrow(() -> new RuntimeException("Message not found"));

        if (!message.getSender().getId().equals(actor.getId())) {
            throw new RuntimeException("You can only delete your own messages");
        }
        if (message.getMessageType() == Message.MessageType.SYSTEM) {
            throw new RuntimeException("System messages cannot be deleted");
        }

        message.setContent("This message was deleted.");
        message.setAttachmentUrl(null);
        message.setDeletedAt(Instant.now());
        Message saved = messageRepository.save(message);
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        MessageDto dto = mapMessageToDto(saved, participants, actor);
        messagingTemplate.convertAndSend("/topic/chat/" + roomId + "/message-deleted", dto);
        return dto;
    }

    @Transactional(readOnly = true)
    public void sendTypingIndicator(UUID roomId, User user, boolean typing) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);

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
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);
        Page<Message> messages = messageRepository.findByChatRoomIdOrderByCreatedAtDesc(roomId, PageRequest.of(page, size));
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);

        if (page == 0) {
            markRoomAsRead(room, user);
        }

        return messages.map(message -> mapMessageToDto(message, participants, user));
    }

    @Transactional(readOnly = true)
    public List<MessageDto> searchMessages(UUID roomId, String query, User user) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);
        if (query == null || query.trim().isBlank()) {
            return List.of();
        }
        List<ChatParticipant> participants = chatParticipantRepository.findByChatRoom(room);
        return messageRepository.searchMessages(roomId, query.trim()).stream()
                .limit(50)
                .map(message -> mapMessageToDto(message, participants, user))
                .collect(Collectors.toList());
    }

    @Transactional
    public void markRoomAsRead(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);
        markRoomAsRead(room, user);
    }

    @Transactional(readOnly = true)
    public List<UserDto> getParticipants(UUID roomId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireParticipant(room, user);

        return chatParticipantRepository.findByChatRoom(room).stream()
                .map(ChatParticipant::getUser)
                .map(this::mapUserToDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public ChatRoomDto setMuted(UUID roomId, User user, boolean muted) {
        ChatRoom room = requireRoom(roomId);
        ChatParticipant participant = requireParticipant(room, user);
        participant.setNotificationsMuted(muted);
        chatParticipantRepository.save(participant);
        return mapToDto(room, user, getOtherParticipant(room, user));
    }

    @Transactional
    public ChatRoomDto pinMessage(UUID roomId, UUID messageId, User user) {
        ChatRoom room = requireRoom(roomId);
        requireGroup(room);
        requireAdmin(room, user);

        if (messageId == null) {
            room.setPinnedMessageId(null);
        } else {
            Message message = messageRepository.findByIdAndChatRoomId(messageId, roomId)
                    .orElseThrow(() -> new RuntimeException("Message not found"));
            room.setPinnedMessageId(message.getId());
        }

        chatRoomRepository.save(room);
        emitRoomUpdated(room, user);
        return mapToDto(room, user, null);
    }

    private User getOtherParticipant(ChatRoom room, User currentUser) {
        return chatParticipantRepository.findByChatRoom(room).stream()
                .map(ChatParticipant::getUser)
                .filter(u -> !u.getId().equals(currentUser.getId()))
                .findFirst()
                .orElse(null);
    }

    private ChatRoomDto mapToDto(ChatRoom room, User currentUser, User otherUser) {
        MessageDto lastMessage = messageRepository.findTopByChatRoomIdOrderByCreatedAtDesc(room.getId())
                .map(message -> mapMessageToDto(message, chatParticipantRepository.findByChatRoom(room), currentUser))
                .orElse(null);

        ChatParticipant currentParticipant = chatParticipantRepository.findByChatRoomAndUser(room, currentUser).orElse(null);
        MessageDto pinnedMessage = null;
        if (room.getPinnedMessageId() != null) {
            pinnedMessage = messageRepository.findByIdAndChatRoomId(room.getPinnedMessageId(), room.getId())
                    .map(message -> mapMessageToDto(message, chatParticipantRepository.findByChatRoom(room), currentUser))
                    .orElse(null);
        }

        ChatRoomDto dto = ChatRoomDto.builder()
                .id(room.getId())
                .name(room.getName())
                .description(room.getDescription())
                .avatarUrl(room.getAvatarUrl())
                .roomType(room.getRoomType())
                .createdBy(room.getCreatedBy().getId())
                .createdByName(room.getCreatedBy().getDisplayName())
                .createdAt(room.getCreatedAt())
                .inviteCode(room.getInviteCode())
                .inviteCodeExpiresAt(room.getInviteCodeExpiresAt())
                .unreadCount((int) getUnreadCount(room, currentUser))
                .memberCount((int) chatParticipantRepository.countByChatRoom(room))
                .muted(currentParticipant != null && currentParticipant.isNotificationsMuted())
                .lastMessage(lastMessage)
                .pinnedMessage(pinnedMessage)
                .build();

        if (room.getRoomType() == ChatRoom.RoomType.DIRECT && otherUser != null) {
            dto.setName(otherUser.getDisplayName());
            dto.setAvatarUrl(otherUser.getAvatarUrl());
        }

        return dto;
    }

    private long getUnreadCount(ChatRoom room, User currentUser) {
        return chatParticipantRepository.findByChatRoomAndUser(room, currentUser)
                .map(participant -> {
                    if (participant.getLastReadMessageId() == null) {
                        return messageRepository.countByChatRoomIdAndSenderIdNot(room.getId(), currentUser.getId());
                    }

                    return messageRepository.findById(participant.getLastReadMessageId())
                            .map(lastReadMessage -> messageRepository.countByChatRoomIdAndCreatedAtAfterAndSenderIdNot(
                                    room.getId(),
                                    lastReadMessage.getCreatedAt(),
                                    currentUser.getId()
                            ))
                            .orElseGet(() -> messageRepository.countByChatRoomIdAndSenderIdNot(room.getId(), currentUser.getId()));
                })
                .orElse(0L);
    }

    private void markRoomAsRead(ChatRoom room, User user) {
        chatParticipantRepository.findByChatRoomAndUser(room, user)
                .ifPresent(participant -> {
                    UUID latestMessageId = messageRepository.findTopByChatRoomIdOrderByCreatedAtDesc(room.getId())
                            .map(Message::getId)
                            .orElse(null);
                    participant.setLastReadMessageId(latestMessageId);
                    chatParticipantRepository.save(participant);
                    messagingTemplate.convertAndSend("/topic/chat/" + room.getId() + "/read-receipts", Map.of(
                            "userId", user.getId().toString(),
                            "roomId", room.getId().toString(),
                            "lastReadMessageId", latestMessageId == null ? "" : latestMessageId.toString()
                    ));
                });
    }

    private void updateLastReadForSender(ChatRoom room, User sender, UUID messageId) {
        chatParticipantRepository.findByChatRoomAndUser(room, sender)
                .ifPresent(participant -> {
                    participant.setLastReadMessageId(messageId);
                    chatParticipantRepository.save(participant);
                });
    }

    private Map<UUID, Instant> buildLastReadMap(List<ChatParticipant> participants) {
        Map<UUID, Instant> lastReadTimes = new HashMap<>();
        for (ChatParticipant participant : participants) {
            if (participant.getLastReadMessageId() == null) {
                continue;
            }
            messageRepository.findById(participant.getLastReadMessageId())
                    .map(Message::getCreatedAt)
                    .ifPresent(instant -> lastReadTimes.put(participant.getUser().getId(), instant));
        }
        return lastReadTimes;
    }

    private MessageDto mapMessageToDto(Message message, List<ChatParticipant> participants, User currentUser) {
        Map<UUID, Instant> lastReadTimes = buildLastReadMap(participants);
        List<String> seenByNames = participants.stream()
                .filter(cp -> !cp.getUser().getId().equals(message.getSender().getId()))
                .filter(cp -> {
                    Instant seenAt = lastReadTimes.get(cp.getUser().getId());
                    return seenAt != null && !seenAt.isBefore(message.getCreatedAt());
                })
                .map(cp -> cp.getUser().getDisplayName())
                .collect(Collectors.toList());

        boolean isRead = false;
        if (currentUser != null) {
            Instant currentUserSeenAt = lastReadTimes.get(currentUser.getId());
            isRead = currentUserSeenAt != null && !currentUserSeenAt.isBefore(message.getCreatedAt());
        }

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
                .isRead(isRead)
                .replyToMessageId(message.getReplyToMessage() == null ? null : message.getReplyToMessage().getId())
                .replyToSenderName(message.getReplyToMessage() == null ? null : message.getReplyToMessage().getSender().getDisplayName())
                .replyToContent(message.getReplyToMessage() == null ? null : message.getReplyToMessage().getContent())
                .editedAt(message.getEditedAt())
                .deleted(message.getDeletedAt() != null)
                .readByCount(seenByNames.size())
                .seenByNames(seenByNames)
                .build();
    }

    private UserDto mapUserToDto(User user) {
        UserPresence presence = userPresenceRepository.findByUserId(user.getId());
        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .displayName(user.getDisplayName())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .createdAt(user.getCreatedAt())
                .isOnline(presence != null && presence.isOnline())
                .lastSeen(presence == null ? null : presence.getLastSeen())
                .build();
    }
}
