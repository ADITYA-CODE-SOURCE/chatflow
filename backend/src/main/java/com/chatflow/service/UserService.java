package com.chatflow.service;

import com.chatflow.dto.UserDto;
import com.chatflow.entity.User;
import com.chatflow.entity.UserPresence;
import com.chatflow.repository.UserPresenceRepository;
import com.chatflow.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final UserPresenceRepository userPresenceRepository;

    public UserService(UserRepository userRepository, UserPresenceRepository userPresenceRepository) {
        this.userRepository = userRepository;
        this.userPresenceRepository = userPresenceRepository;
    }

    public UserDto toDto(User user) {
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

    public Page<UserDto> searchUsers(String query, int page, int size, User currentUser) {
        String q = query == null ? "" : query.trim();
        UUID currentUserId = currentUser.getId();

        Page<User> result = userRepository
                .findByEmailContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(q, q, PageRequest.of(page, size));

        // Keep it simple for now: return full page and filter out current user on the client.
        return result.map(this::toDto);
    }
}
