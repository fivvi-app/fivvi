import { Hello } from './hello';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const { name } = await searchParams;
  return <Hello firstName={typeof name === 'string' ? name.trim() : ''} />;
}
