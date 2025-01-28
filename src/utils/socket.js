const socket = require("socket.io");
const crypto = require("crypto");
const { Chat } = require("../models/chat");
const ConnectionRequestModel = require("../models/connectionRequest");
const User = require("../models/user");


const getSecretRoomId = (userId, targetUserId) => {
    return crypto.createHash("sha256").update([userId, targetUserId].sort().join("$")).digest("hex");
}

const initialiseSocket = (server) => {
    const io = socket(server, {
        cors : {
            origin : "http://localhost:5173"
        }
    });
    io.on("connection", (socket) => {
        // handle the event
        socket.on("joinChat", ({firstName, userId, targetUserId}) => {
            const roomId = getSecretRoomId(userId, targetUserId);
            socket.join(roomId);
        })

        socket.on("sendMessage", async ({firstName,lastName, userId, targetUserId, text}) => {
            try{
                const roomId = getSecretRoomId(userId, targetUserId);
                const existingConnectionRequest = await ConnectionRequestModel.findOne({
                    $or: [
                      { fromUserId : userId, toUserId : targetUserId, status : "accepted" },
                      { fromUserId: targetUserId, toUserId: userId, status : "accepted" },
                    ],
                });

                if (!existingConnectionRequest) {
                    return; // Stop execution if they're not friends
                }
    
                let chat = await Chat.findOne({
                    participants : {$all : [userId, targetUserId]},
                })
                if(!chat){
                    chat = new Chat({
                        participants : [userId, targetUserId],
                        messages : []
                    });
                }
                chat.messages.push({
                    senderId : userId,
                    text,
                })
                await chat.save();
                io.to(roomId).emit("messageReceived", {firstName, lastName, text});
            }catch(err){
                console.log(err);
            }
        })

        socket.on("disconnect", () => {});
    });
}

module.exports = initialiseSocket;