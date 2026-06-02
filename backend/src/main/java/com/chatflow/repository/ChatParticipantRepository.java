package com.chatflow.repository;

import com.chatflow.entity.ChatParticipant;
import com.chatflow.entity.ChatRoom;
import com.chatflow.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, UUID> {
    
    List<ChatParticipant> findByChatRoom(ChatRoom chatRoom);
    
    List<ChatParticipant> findByUser(User user);
    
    Optional<ChatParticipant> findByChatRoomAndUser(ChatRoom chatRoom, User user);
    
    boolean existsByChatRoomAndUser(ChatRoom chatRoom, User user);

    boolean existsByChatRoomIdAndUserId(UUID chatRoomId, UUID userId);
    
    void deleteByChatRoomAndUser(ChatRoom chatRoom, User user);

    void deleteByChatRoomId(UUID roomId);
    
    @Query("SELECT cp.user FROM ChatParticipant cp WHERE cp.chatRoom.id = :roomId")
    List<User> findUsersByChatRoomId(@Param("roomId") UUID roomId);

    long countByChatRoom(ChatRoom chatRoom);
}
