export function useAside() {
  const aside = useState("aside", () => false);
  const toggle = () => {
    aside.value = !aside.value;
  };
  return { aside, toggle };
}
