package com.chatflow.controller;

import com.chatflow.security.UserPrincipal;
import com.chatflow.service.PresenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/presence")
@RequiredArgsConstructor
public class PresenceController {

    private final PresenceService presenceService;

    @PostMapping("/online")
    public ResponseEntity<Void> online(@AuthenticationPrincipal UserPrincipal principal) {
        presenceService.setOnline(principal.getUser(), true);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/offline")
    public ResponseEntity<Void> offline(@AuthenticationPrincipal UserPrincipal principal) {
        presenceService.setOnline(principal.getUser(), false);
        return ResponseEntity.ok().build();
    }
}
