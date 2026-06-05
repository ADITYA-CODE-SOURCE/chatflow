package com.chatflow.repository;

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
public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {
    
    @Query("SELECT cr FROM ChatRoom cr JOIN ChatParticipant cp ON cp.chatRoom = cr WHERE cp.user = :user")
    List<ChatRoom> findByUser(@Param("user") User user);
    
    @Query("SELECT cr FROM ChatRoom cr JOIN ChatParticipant cp ON cp.chatRoom = cr WHERE cp.user = :user AND cr.id = :roomId")
    Optional<ChatRoom> findByUserAndId(@Param("user") User user, @Param("roomId") UUID roomId);
    
    @Query("SELECT DISTINCT cr FROM ChatRoom cr JOIN ChatParticipant cp1 ON cp1.chatRoom = cr JOIN ChatParticipant cp2 ON cp2.chatRoom = cr WHERE cr.roomType = 'DIRECT' AND cp1.user = :user1 AND cp2.user = :user2 ORDER BY cr.createdAt ASC")
    List<ChatRoom> findDirectRooms(@Param("user1") User user1, @Param("user2") User user2);

    Optional<ChatRoom> findByInviteCode(String inviteCode);
}
