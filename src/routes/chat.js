const express = require("express");
const chatRouter = express.Router();
const { Chat } = require("../models/chat");
const { userAuth } = require("../middlewares/auth");

chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
    const userId = req.user._id.toString();
    const { targetUserId } = req.params;

    try {
        let chat = await Chat.findOne({
            participants: { $all: [userId, targetUserId] }
        })
        .populate('messages.senderId', 'firstName lastName')
        .populate('participants', 'firstName lastName photoUrl isOnline lastActive');

        if (!chat) {
            chat = new Chat({
                participants: [userId, targetUserId],
                messages: [],
                unreadCount: new Map([[userId, 0], [targetUserId, 0]])
            });
            await chat.save();
        }

        // Mark messages as seen and reset unread count for current user
        await Chat.updateOne(
            { _id: chat._id },
            { 
                $set: { 
                    "messages.$[elem].seen": true,
                    [`unreadCount.${userId}`]: 0 
                } 
            },
            { arrayFilters: [{ "elem.seen": false, "elem.senderId": targetUserId }] }
        );

        chat = await Chat.findById(chat._id)
            .populate('messages.senderId', 'firstName lastName')
            .populate('participants', 'firstName lastName photoUrl isOnline lastActive');

        const io = req.app.get('socketio');
        if (io) {
            const roomId = [userId, targetUserId].sort().join('_');
            io.to(roomId).emit('messageSeen', { chatId: chat._id });
            io.to(roomId).emit('unreadCountUpdate', { chatId: chat._id, unreadCount: chat.unreadCount });
        }

        res.json(chat);
    } catch (err) {
        console.error('Error in /chat/:targetUserId:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

chatRouter.get("/chats", userAuth, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const chats = await Chat.find({
            participants: userId
        })
        .populate('participants', 'firstName lastName photoUrl isOnline lastActive')
        .select('participants messages unreadCount');

        res.json(chats);
    } catch (err) {
        console.error('Error in /chats:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

module.exports = chatRouter;