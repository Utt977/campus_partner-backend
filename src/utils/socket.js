const socket = require("socket.io");
const crypto = require("crypto");
const { Chat } = require("../models/chat");
const User = require("../models/user");
const ConnectionRequestModel = require("../models/connectionRequest");

const getSecretRoomId = (userId, targetUserId) => {
    return crypto.createHash("sha256").update([userId, targetUserId].sort().join("$")).digest("hex");
};

const initialiseSocket = (server) => {
    const io = socket(server, {
        cors: {
            origin: "http://localhost:5173"
        }
    });

    io.on("connection", (socket) => {
        // Track online status
        socket.on("userOnline", async (userId) => {
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastActive: new Date()
            });
            socket.broadcast.emit("userStatusChanged", { userId, isOnline: true });
        });

        // Join chat room
        socket.on("joinChat", ({ userId, targetUserId }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.join(roomId);
        });

        // Handle messages
        socket.on("sendMessage", async ({ userId, targetUserId, text }) => {
            try {
                const roomId = getSecretRoomId(userId, targetUserId);
                
                // Check connection
                const isConnected = await ConnectionRequestModel.exists({
                    $or: [
                        { fromUserId: userId, toUserId: targetUserId, status: "accepted" },
                        { fromUserId: targetUserId, toUserId: userId, status: "accepted" }
                    ]
                });

                if (!isConnected) return;

                // Save message
                const newMessage = {
                    senderId: userId,
                    text,
                    seen: false,
                    timestamp: new Date()
                };

                await Chat.findOneAndUpdate(
                    { participants: { $all: [userId, targetUserId] } },
                    { $push: { messages: newMessage } },
                    { upsert: true, new: true }
                );

                // Emit to room
                io.to(roomId).emit("messageReceived", {
                    ...newMessage,
                    senderId: userId,
                    timestamp: new Date()
                });

            } catch (err) {
                console.error(err);
            }
        });

        // Mark messages as seen
        socket.on("markAsSeen", async ({ userId, targetUserId }) => {
            try {
                await Chat.updateMany(
                    {
                        participants: { $all: [userId, targetUserId] },
                        "messages.seen": false
                    },
                    { $set: { "messages.$[elem].seen": true } },
                    { arrayFilters: [{ "elem.senderId": targetUserId }] }
                );

                const roomId = getSecretRoomId(userId, targetUserId);
                io.to(roomId).emit("messagesSeen", { userId });

            } catch (err) {
                console.error(err);
            }
        });
        socket.on("typing", ({ userId, targetUserId, isTyping }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.to(roomId).emit("typingStatus", isTyping);
          });

        // Handle disconnect
        socket.on("disconnect", async () => {
            // Get userId from your authentication system
            // await User.findByIdAndUpdate(userId, { isOnline: false });
        });
    });

    return io;
};

module.exports = initialiseSocket;