import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function IndexPage() {
  const authContext = await auth();
  const isLoggedIn = !!authContext.userId;

  if (isLoggedIn) {
    redirect('/workspace');
  } else {
    redirect('/signup');
  }
}
