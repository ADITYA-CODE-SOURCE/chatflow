package com.chatflow.service;

import com.chatflow.dto.UserDto;
import com.chatflow.dto.UserUpdateDto;
import com.chatflow.entity.User;
import com.chatflow.entity.UserPresence;
import com.chatflow.repository.UserPresenceRepository;
import com.chatflow.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

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
        Page<User> result = userRepository
                .findByIdNotAndEmailContainingIgnoreCaseOrIdNotAndDisplayNameContainingIgnoreCase(
                        currentUser.getId(),
                        q,
                        currentUser.getId(),
                        q,
                        PageRequest.of(page, size)
                );

        return result.map(this::toDto);
    }

    public UserDto updateProfile(User currentUser, UserUpdateDto request) {
        User user = userRepository.findById(currentUser.getId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setDisplayName(request.getDisplayName().trim());
        user.setBio(request.getBio() == null || request.getBio().trim().isEmpty() ? null : request.getBio().trim());
        user.setAvatarUrl(request.getAvatarUrl() == null || request.getAvatarUrl().trim().isEmpty() ? null : request.getAvatarUrl().trim());

        return toDto(userRepository.save(user));
    }
}
