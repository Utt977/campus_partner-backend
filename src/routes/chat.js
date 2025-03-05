const express = require("express");
const chatRouter = express.Router();

const  {Chat}  = require("../models/chat");
const {userAuth} = require("../middlewares/auth");

chatRouter.get("/chat/:targetUserId", userAuth, async (req, res) => {
    const userId = req.user._id;
    const {targetUserId} = req.params;

    try{
        let chat = await Chat.findOne({
            participants : {$all : [userId, targetUserId]}
        }).populate({
            path : "messages.senderId",
            select : "firstName lastName"
        });
        if(!chat) {
            chat = new Chat({
                participants : [userId, targetUserId],
                messages : []
            })
            await chat.save();
        }
        res.json(chat);
    }catch(err){
        console.log(err);
    }
})

// New route in chatRouter.js
chatRouter.post('/messages/mark-seen', userAuth, async (req, res) => {
    try {
        await Chat.updateMany(
            { 
                "participants": req?.user?._id,
                "messages.seen": false 
            },
            { $set: { "messages.$[].seen": true } }
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = chatRouter;