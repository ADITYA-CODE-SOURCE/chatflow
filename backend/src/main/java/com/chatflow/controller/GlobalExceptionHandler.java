package com.chatflow.controller;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntimeException(RuntimeException exception) {
        return buildError(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException exception) {
        String message = exception.getMostSpecificCause() != null ? exception.getMostSpecificCause().getMessage() : exception.getMessage();
        String normalized = message == null ? "" : message.toLowerCase();
        if (normalized.contains("users") && normalized.contains("email")) {
            return buildError(HttpStatus.BAD_REQUEST, "Email already exists");
        }
        if (normalized.contains("invite_code")) {
            return buildError(HttpStatus.BAD_REQUEST, "Could not generate a unique invite code. Please try again.");
        }
        if (normalized.contains("chat_rooms") && normalized.contains("name")) {
            return buildError(HttpStatus.BAD_REQUEST, "Group name is invalid");
        }
        if (normalized.contains("constraint") && normalized.contains("messages")) {
            return buildError(HttpStatus.BAD_REQUEST, "Database schema is outdated. Please restart the server with a clean database.");
        }
        if (normalized.contains("constraint") || normalized.contains("check")) {
            return buildError(HttpStatus.BAD_REQUEST, "Data constraint violation. Please check your input.");
        }
        return buildError(HttpStatus.BAD_REQUEST, "Request violates data constraints");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationException(MethodArgumentNotValidException exception) {
        FieldError fieldError = exception.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
        String message = fieldError != null ? fieldError.getDefaultMessage() : "Invalid request";
        return buildError(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, String>> handleConstraintViolation(ConstraintViolationException exception) {
        return buildError(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    private ResponseEntity<Map<String, String>> buildError(HttpStatus status, String message) {
        Map<String, String> body = new HashMap<>();
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
