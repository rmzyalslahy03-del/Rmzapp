// common.js – دوال مساعدة عامة
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://serlegwdzjulfcxabxzv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4_c97KxnG_7HTvfv-pKeNQ_FTlnK6Yx';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getCurrentUser() {
    const raw = localStorage.getItem('ramzapp_user');
    return raw ? JSON.parse(raw) : null;
}

export async function sendMessage(receiverId, { text, type = 'text', img = '', replyTo = null }) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');
    const { data, error } = await supabase.from('messages').insert({
        sender_id: user.id, receiver_id: receiverId,
        content: text || '', type, media_url: img, reply_to: replyTo,
        status: 'sent'
    }).select().single();
    if (error) throw error;
    return data;
}

export async function uploadImage(file) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not logged in');
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('ramz-images').upload(fileName, file);
    if (error) throw error;
    const { data: publicURL } = supabase.storage.from('ramz-images').getPublicUrl(fileName);
    return publicURL.publicUrl;
}

export function toast(msg, duration = 2000) {
    let el = document.querySelector('.global-toast');
    if (el) el.remove();
    el = document.createElement('div');
    el.className = 'global-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}

export function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'الآن';
    if (s < 3600) return Math.floor(s/60) + ' د';
    if (s < 86400) return Math.floor(s/3600) + ' س';
    return Math.floor(s/86400) + ' يوم';
}

export function fmtTime(d) { return new Date(d).toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' }); }
export function fmtDate(d) { return new Date(d).toLocaleDateString('ar-SA', { weekday:'long', month:'long', day:'numeric' }); }
export function esc(s) { return s ? s.replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' })[m]) : ''; }

export function subscribeToMessages(chatId, onMessage) {
    const user = JSON.parse(localStorage.getItem('ramzapp_user'));
    if (!user) return null;
    return supabase.channel(`msg-${chatId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, payload => {
            if (payload.new.sender_id === chatId) onMessage(payload.new);
        }).subscribe();
}

export function onTypingEvent(chatId, callback) {
    const channel = supabase.channel(`typing-${chatId}`);
    channel.on('broadcast', { event: 'typing' }, payload => {
        if (payload.user_id === chatId) callback(payload.isTyping);
    }).subscribe();
    return channel;
}

export function sendTypingEvent(chatId, isTyping) {
    const user = JSON.parse(localStorage.getItem('ramzapp_user'));
    if (!user) return;
    supabase.channel(`typing-${chatId}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, isTyping } });
}
