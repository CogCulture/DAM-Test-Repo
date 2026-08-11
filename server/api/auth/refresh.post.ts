import { getUser } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session.user) {
    return { loggedIn: false };
  }

  // @ts-ignore
  const updatedUser = await getUser(session.user.id);
  if (updatedUser) {
    await setUserSession(event, { user: updatedUser });
  } else {
    await clearUserSession(event);
    return { loggedIn: false };
  }

  return { loggedIn: true, user: updatedUser };
});
