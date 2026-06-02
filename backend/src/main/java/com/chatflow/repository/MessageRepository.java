package com.chatflow.repository;

import com.chatflow.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {
    
    @Query("SELECT m FROM Message m WHERE m.chatRoom.id = :roomId ORDER BY m.createdAt DESC")
    Page<Message> findByChatRoomIdOrderByCreatedAtDesc(@Param("roomId") UUID roomId, Pageable pageable);

    Optional<Message> findTopByChatRoomIdOrderByCreatedAtDesc(UUID roomId);

    Optional<Message> findByIdAndChatRoomId(UUID id, UUID roomId);

    List<Message> findByChatRoomIdOrderByCreatedAtAsc(UUID roomId);

    @Query("SELECT m FROM Message m WHERE m.chatRoom.id = :roomId AND m.deletedAt IS NULL AND LOWER(m.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY m.createdAt DESC")
    List<Message> searchMessages(@Param("roomId") UUID roomId, @Param("query") String query);

    void deleteByChatRoomId(UUID roomId);

    long countByChatRoomIdAndCreatedAtAfterAndSenderIdNot(UUID roomId, Instant after, UUID senderId);

    long countByChatRoomIdAndSenderIdNot(UUID roomId, UUID senderId);
}
