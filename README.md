# ChatFlow

ChatFlow is a real-time chat application built with Spring Boot, WebSocket/STOMP, React, Vite, Zustand, and an H2 file database.

It supports direct messages, group chats, invite links, image sharing, read receipts, presence, typing indicators, group roles, pinned messages, mute settings, and message actions like reply, edit, and delete.

## Tech Stack

- Backend: Java 17+, Spring Boot 3.2.5, Spring Security, Spring WebSocket, Spring Data JPA, H2, JWT
- Frontend: React 18, TypeScript, Vite, Zustand, Axios, SockJS, STOMP, emoji-picker-react
- Database: H2 file database at `./data/chatflow`
- Realtime: STOMP over SockJS on `/ws`

## Project Structure

```text
chatflow/
  backend/
    src/main/java/com/chatflow/
      config/
      controller/
      dto/
      entity/
      repository/
      security/
      service/
    src/main/resources/application.yml
  frontend/
    src/
      components/
      pages/
      services/
      stores/
      styles/
      types/
```

## Features

### Authentication

- Register
- Login
- JWT access + refresh tokens
- Persistent auth state in local storage

### Chat

- Direct messages
- Group chats
- Real-time messaging over WebSocket
- Typing indicators
- Read receipts and unread counts
- Online/offline presence and last seen
- Message search
- Reply to message
- Edit own message
- Delete own message
- Emoji picker

### Media

- Image upload with validation
- Full backend image URL storage
- Thumbnail rendering in chat
- Click-to-open lightbox preview
- Supported formats: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Max image size: `5 MB`

### Groups

- Create group
- Join by invite code or invite link
- Regenerate invite code
- Copy invite code
- Copy invite link
- Owner/Admin role management
- Add/remove members
- Promote/demote admins
- Leave group
- Delete group
- Pin message
- Mute notifications
- System messages for key group events

## Roles and Permissions

### OWNER

- Rename group
- Update description/avatar
- Add/remove members
- Promote/demote admins
- Regenerate invite code
- Pin/unpin message
- Delete group

### ADMIN

- Update group info
- Add/remove normal members
- Regenerate invite code
- Pin/unpin message

### MEMBER

- View members
- Send messages
- Reply/edit/delete own messages
- Leave group

## Architecture Overview

### Backend

- `controller/`: REST API endpoints
- `service/`: business logic and permission checks
- `repository/`: JPA repositories
- `entity/`: persistent models
- `security/`: JWT auth filter and principal
- `config/`: security, websocket, and static file config

### Frontend

- `pages/Dashboard.tsx`: main chat experience
- `components/GroupSettingsModal.tsx`: group management UI
- `components/NewChatModal.tsx`: direct message and join-group UI
- `services/api.ts`: Axios API client and media URL normalization
- `stores/index.ts`: Zustand auth/chat state

## Data Storage

- H2 file database: `jdbc:h2:file:./data/chatflow;AUTO_SERVER=TRUE`
- Uploaded files: `backend/uploads/`
- Schema updates automatically with `ddl-auto: update`

## Run Locally

### Prerequisites

- Java 17 or newer
- Maven available on `PATH`
- Node.js 18+ and npm

### Backend

Use PowerShell:

```powershell
cd D:\chatflow\backend
$env:MAVEN_OPTS="-Xmx1024m -XX:MaxMetaspaceSize=256m"
mvn spring-boot:run
```

Backend runs at:

- `http://localhost:8080`
- H2 console: `http://localhost:8080/h2-console`

### Frontend

Use a second PowerShell window:

```powershell
cd D:\chatflow\frontend
npm install
npm run dev
```

Frontend runs at:

- `http://localhost:5173`

## Build Verification

### Backend

```powershell
cd D:\chatflow\backend
mvn -q clean compile
```

### Frontend

```powershell
cd D:\chatflow\frontend
npm run build
```

## Important Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

### Chat Rooms

- `GET /api/chat-rooms`
- `POST /api/chat-rooms`
- `POST /api/chat-rooms/direct`
- `GET /api/chat-rooms/{roomId}`
- `GET /api/chat-rooms/{roomId}/messages`
- `GET /api/chat-rooms/{roomId}/messages/search?q=term`
- `POST /api/chat-rooms/{roomId}/messages`
- `PUT /api/chat-rooms/{roomId}/messages/{messageId}`
- `DELETE /api/chat-rooms/{roomId}/messages/{messageId}`
- `POST /api/chat-rooms/{roomId}/typing`
- `POST /api/chat-rooms/{roomId}/read`
- `GET /api/chat-rooms/{roomId}/participants`
- `GET /api/chat-rooms/{roomId}/members`
- `PUT /api/chat-rooms/{roomId}`
- `PUT /api/chat-rooms/{roomId}/mute`
- `PUT /api/chat-rooms/{roomId}/pin`
- `POST /api/chat-rooms/{roomId}/leave`
- `POST /api/chat-rooms/{roomId}/members`
- `DELETE /api/chat-rooms/{roomId}/members/{userId}`
- `POST /api/chat-rooms/{roomId}/admins/{userId}`
- `DELETE /api/chat-rooms/{roomId}/admins/{userId}`
- `DELETE /api/chat-rooms/{roomId}`

### Group Invites

- `GET /api/groups/{groupId}/invite`
- `POST /api/groups/{groupId}/regenerate-invite`
- `POST /api/groups/join/{inviteCode}`

### Uploads

- `POST /api/uploads/image`
- `GET /uploads/{fileName}`

### Presence

- `POST /api/presence/online`
- `POST /api/presence/offline`

## WebSocket Topics

- `/topic/chat/{roomId}`
- `/topic/chat/{roomId}/typing`
- `/topic/chat/{roomId}/room-updated`
- `/topic/chat/{roomId}/message-updated`
- `/topic/chat/{roomId}/message-deleted`
- `/topic/chat/{roomId}/read-receipts`
- `/topic/chat/{roomId}/member-added`
- `/topic/chat/{roomId}/member-removed`
- `/topic/chat/{roomId}/member-left`
- `/topic/chat/{roomId}/member-joined`
- `/topic/chat/{roomId}/role-updated`
- `/topic/groups/deleted`
- `/topic/presence`

## How to Test Key Flows

### 1. Delete Group

1. Login as the group owner.
2. Open the group.
3. Click `Settings`.
4. Click `Delete group`.
5. Confirm the popup.
6. Verify:
   - success toast appears
   - group disappears from sidebar
   - chat view redirects to another room or empty state

### 2. Join with Invite Link

1. Open a group as owner or admin.
2. Open `Settings`.
3. Click `Copy Link`.
4. Open the copied link in the browser.
5. If logged out, sign in.
6. Verify:
   - group is joined
   - group appears in sidebar
   - system message appears for invite-link join

### 3. Send and Open Image

1. Open a chat room.
2. Attach an image.
3. Send the message.
4. Open the same room from another account.
5. Verify:
   - thumbnail is visible
   - clicking the image opens a full preview
   - image loads for both sender and receiver

### 4. Add / Remove / Promote Member

1. Open group `Settings` as owner.
2. Search and add a member.
3. Promote that member to admin.
4. Demote them back if needed.
5. Remove a normal member.
6. Verify:
   - member list updates
   - badges update correctly
   - system messages appear in chat

## Security Rules

- All chat APIs require authentication except public uploads access and auth endpoints.
- Users can only access rooms where they are participants.
- Only owner/admin can manage group members.
- Admin cannot remove owner.
- Only owner can delete group.
- Duplicate group members are blocked.
- Invite codes are validated and can expire.
- Message edit/delete is limited to the original sender.

## Troubleshooting

### `mvn` not recognized

Install Maven and add it to your `PATH`, then restart PowerShell.

### Frontend shows `/ws/info` proxy errors

The backend is not running on port `8080`. Start the Spring Boot app first.

### Port `5173` or `8080` already in use

Close old dev processes or let Vite choose a different frontend port.

### Images do not load

Make sure backend is running and that `/uploads/**` is reachable from `http://localhost:8080`.

## Current Notes

- There is no dedicated lint script yet.
- There is no formal automated test suite yet.
- The app is verified by successful backend compile, backend boot, and frontend production build.
