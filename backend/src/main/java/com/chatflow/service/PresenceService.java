package com.chatflow.service;

import com.chatflow.dto.PresenceDto;
import com.chatflow.entity.User;
import com.chatflow.entity.UserPresence;
import com.chatflow.repository.UserPresenceRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class PresenceService {

    private final UserPresenceRepository userPresenceRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public PresenceService(UserPresenceRepository userPresenceRepository, SimpMessagingTemplate messagingTemplate) {
        this.userPresenceRepository = userPresenceRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public void setOnline(User user, boolean online) {
        UUID userId = user.getId();
        Instant now = Instant.now();

        UserPresence presence = userPresenceRepository.findByUserId(userId);
        if (presence == null) {
            presence = UserPresence.builder()
                    .userId(userId)
                    .isOnline(online)
                    .lastSeen(now)
                    .build();
        } else {
            presence.setOnline(online);
            presence.setLastSeen(now);
        }
        userPresenceRepository.save(presence);

        PresenceDto dto = PresenceDto.builder()
                .userId(userId)
                .displayName(user.getDisplayName())
                .online(online)
                .lastSeen(now)
                .build();

        messagingTemplate.convertAndSend("/topic/presence", dto);
    }
}
