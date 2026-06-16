// db.js – التخزين المحلي SQLite (OPFS)
import initSqlJs from 'https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/sql-wasm.mjs';

let SQL = null;
let db = null;
const DB_FILENAME = 'ramzapp.db';

// تهيئة قاعدة البيانات
async function initDatabase() {
    if (db) return db;
    SQL = await initSqlJs({ locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/${file}` });
    let fileHandle = null;
    try {
        const root = await navigator.storage.getDirectory();
        fileHandle = await root.getFileHandle(DB_FILENAME);
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
    } catch (e) { db = new SQL.Database(); }
    
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            content TEXT DEFAULT '',
            type TEXT DEFAULT 'text',
            media_url TEXT DEFAULT '',
            reply_to TEXT,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'sent',
            is_read INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_msgs_sender ON messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_msgs_receiver ON messages(receiver_id);
    `);
    await saveDatabase();
    return db;
}

async function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(data));
    await writable.close();
}

// إدراج رسالة
async function insertMessage(msg) {
    const db = await initDatabase();
    db.run(`
        INSERT OR REPLACE INTO messages (id, sender_id, receiver_id, content, type, media_url, reply_to, created_at, status, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        msg.id, msg.sender_id, msg.receiver_id, msg.content || '', msg.type || 'text',
        msg.media_url || '', msg.reply_to || null, msg.created_at, msg.status || 'sent',
        msg.status === 'read' ? 1 : 0
    ]);
    await saveDatabase();
}

// جلب الرسائل بين مستخدمين
function getMessages(userId, contactId) {
    if (!db) return [];
    const stmt = db.prepare(`
        SELECT * FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
    `);
    stmt.bind([userId, contactId, contactId, userId]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

// آخر رسالة لكل جهة اتصال
function getLastMessageForContacts(userId, contactIds) {
    const result = {};
    for (const cid of contactIds) {
        const stmt = db.prepare(`
            SELECT * FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at DESC LIMIT 1
        `);
        stmt.bind([userId, cid, cid, userId]);
        if (stmt.step()) result[cid] = stmt.getAsObject();
        stmt.free();
    }
    return result;
}

function getUnreadCount(userId, contactId) {
    if (!db) return 0;
    const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`);
    stmt.bind([contactId, userId]);
    let count = 0;
    if (stmt.step()) count = stmt.getAsObject().cnt;
    stmt.free();
    return count;
}

async function updateMessageLocalStatus(msgId, status, newId = null) {
    const db = await initDatabase();
    const isRead = status === 'read' ? 1 : 0;
    if (newId) db.run(`UPDATE messages SET id = ?, status = ?, is_read = ? WHERE id = ?`, [newId, status, isRead, msgId]);
    else db.run(`UPDATE messages SET status = ?, is_read = ? WHERE id = ?`, [status, isRead, msgId]);
    await saveDatabase();
}

async function deleteMessageLocal(msgId) {
    const db = await initDatabase();
    db.run(`DELETE FROM messages WHERE id = ?`, [msgId]);
    await saveDatabase();
}

function getPendingMessages(userId) {
    if (!db) return [];
    const stmt = db.prepare(`SELECT * FROM messages WHERE status IN ('sending','failed') AND sender_id = ?`);
    stmt.bind([userId]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

export {
    initDatabase, insertMessage, getMessages, getLastMessageForContacts,
    getUnreadCount, updateMessageLocalStatus, deleteMessageLocal, getPendingMessages
};
