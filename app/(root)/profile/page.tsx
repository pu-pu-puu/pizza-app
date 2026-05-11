import { prisma } from '@/prisma/prisma-client';
import { getUserSession } from '@/lib/get-user-session';
import { redirect } from 'next/navigation';
import { Container, ProfileForm, ProfileOrders } from '@/components/shared';

export default async function ProfilePage() {
  const session = await getUserSession();

  if (!session) {
    return redirect('/not-auth');
  }

  const userId = Number(session.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return redirect('/not-auth');
  }

  const [user, orders] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        totalAmount: true,
        status: true,
        fulfillmentStatus: true,
        paymentId: true,
        createdAt: true,
        fullName: true,
        phone: true,
        address: true,
        comment: true,
        items: true,
      },
    }),
  ]);

  if (!user) {
    return redirect('/not-auth');
  }

  const ordersForView = orders.map((order) => ({
    ...order,
    items:
      typeof order.items === 'string'
        ? order.items
        : JSON.stringify(order.items),
  }));

  return (
    <>
      <ProfileForm data={user} />
      <Container className='mb-10'>
        <ProfileOrders orders={ordersForView} />
      </Container>
    </>
  );
}
