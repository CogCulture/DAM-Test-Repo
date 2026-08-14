export function useBucket() {
  type Bucket = {
    id: string;
    name: string;
    userId: string;
    size: number;
  };
  const bucket = useState<Bucket | null>("bucket", () => null);
  const loading = ref(false);
  const fetchBucket = async () => {
    if (loading.value) return;
    loading.value = true;
    const { data } = await useFetch<Bucket>("/api/bucket");
    if (data.value) bucket.value = data.value;
    loading.value = false;
  };
  onMounted(() => {
    if (bucket.value) {
      loading.value = false;
    } else {
      fetchBucket();
    }
  });
  return { loading, bucket };
};
