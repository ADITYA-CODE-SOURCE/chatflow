package com.chatflow.controller;

import com.chatflow.dto.UserDto;
import com.chatflow.security.UserPrincipal;
import com.chatflow.service.UserService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(userService.toDto(principal.getUser()));
    }

    @GetMapping("/search")
    public ResponseEntity<Page<UserDto>> search(
            @RequestParam(name = "q", defaultValue = "") String query,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(userService.searchUsers(query, page, size, principal.getUser()));
    }
}
