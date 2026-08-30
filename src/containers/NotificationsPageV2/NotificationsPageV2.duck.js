/**
 * src/containers/NotificationsPageV2/NotificationsPageV2.duck.js
 *
 * The real, persisted notification list (spec section 40) - GET /api/v2/notifications,
 * PATCH /api/v2/notifications/:id/read (and the 'read-all' special id). Never a static/fake
 * list; architected so push/email can fan out from the same events later without this page
 * changing (per server/models/Notification.js's own header).
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';

export const fetchNotificationsV2Thunk = createAsyncThunk(
  'notificationsPageV2/fetch',
  (_, { rejectWithValue }) => apiV2('/api/v2/notifications').catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const markReadV2Thunk = createAsyncThunk(
  'notificationsPageV2/markRead',
  (id, { rejectWithValue }) =>
    apiV2(`/api/v2/notifications/${id}/read`, { method: 'PATCH' })
      .then(() => id)
      .catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const markAllReadV2Thunk = createAsyncThunk(
  'notificationsPageV2/markAllRead',
  (_, { rejectWithValue }) =>
    apiV2('/api/v2/notifications/read-all/read', { method: 'PATCH' }).catch(e => rejectWithValue(storableApiV2Error(e)))
);

const initialState = {
  notifications: [],
  unreadCount: 0,
  fetchInProgress: false,
  fetchError: null,
};

const notificationsPageV2Slice = createSlice({
  name: 'notificationsPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchNotificationsV2Thunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(fetchNotificationsV2Thunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.notifications = action.payload.notifications;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(fetchNotificationsV2Thunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      })
      .addCase(markReadV2Thunk.fulfilled, (state, action) => {
        const n = state.notifications.find(n => n._id === action.payload);
        if (n && !n.read) {
          n.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllReadV2Thunk.fulfilled, state => {
        state.notifications.forEach(n => {
          n.read = true;
        });
        state.unreadCount = 0;
      });
  },
});

export default notificationsPageV2Slice.reducer;
