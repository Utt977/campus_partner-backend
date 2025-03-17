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
        socket.on("userOnline", async (userId) => {
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastActive: new Date()
            });
            io.emit("userStatusChanged", { userId, isOnline: true });
        });

        socket.on("userOffline", async (userId) => {
            await User.findByIdAndUpdate(userId, {
                isOnline: false,
                lastActive: new Date()
            });
            io.emit("userStatusChanged", { userId, isOnline: false });
        });

        socket.on("joinChat", ({ userId, targetUserId }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.join(roomId);
        });

        socket.on("sendMessage", async ({ userId, targetUserId, text, tempId }) => {
            try {
                const roomId = getSecretRoomId(userId, targetUserId);
                
                const isConnected = await ConnectionRequestModel.exists({
                    $or: [
                        { fromUserId: userId, toUserId: targetUserId, status: "accepted" },
                        { fromUserId: targetUserId, toUserId: userId, status: "accepted" }
                    ]
                });

                if (!isConnected) return;

                const newMessage = {
                    senderId: userId,
                    text,
                    seen: false,
                    timestamp: new Date()
                };

                const chat = await Chat.findOneAndUpdate(
                    { participants: { $all: [userId, targetUserId] } },
                    { 
                        $push: { messages: newMessage },
                        $inc: { [`unreadCount.${targetUserId}`]: 1 }
                    },
                    { upsert: true, new: true }
                ).populate('participants', 'firstName lastName');

                io.to(roomId).emit("messageReceived", {
                    ...newMessage,
                    senderId: userId,
                    tempId,
                    timestamp: new Date()
                });

                io.to(roomId).emit("unreadCountUpdate", {
                    chatId: chat._id,
                    unreadCount: chat.unreadCount
                });
            } catch (err) {
                console.error(err);
            }
        });

        socket.on("typing", ({ userId, firstName, targetUserId, isTyping }) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            io.to(roomId).emit("typingStatus", { userId, firstName, isTyping });
        });

        socket.on("disconnect", async () => {
            try {
                if (socket.handshake.query.userId) {
                    await User.findByIdAndUpdate(socket.handshake.query.userId, {
                        isOnline: false,
                        lastActive: new Date()
                    });
                    io.emit("userStatusChanged", {
                        userId: socket.handshake.query.userId,
                        isOnline: false
                    });
                }
            } catch (err) {
                console.error("Disconnect error:", err);
            }
        });
    });

    return io;
};

module.exports = initialiseSocket;