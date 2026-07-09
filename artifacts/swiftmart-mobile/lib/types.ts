export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'vendor' | 'rider' | 'admin';
  avatar?: string;
  pincode?: string;
  addresses?: Address[];
}

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

export interface Shop {
  _id: string;
  name: string;
  /** Production API returns shopName instead of name in some responses */
  shopName?: string;
  description?: string;
  category?: string;
  image?: string;
  coverImage?: string;
  banner?: string;
  rating?: number;
  totalRatings?: number;
  deliveryTime?: string;
  minOrder?: number;
  deliveryFee?: number;
  isOpen?: boolean;
  address?: Address;
}

export interface ProductWeightOption {
  label: string;
  value: string;
  price: number;
}

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  discountedPrice?: number;
  image?: string;
  images?: string[];
  category?: string;
  stock?: number;
  unit?: string;
  isAvailable?: boolean;
  shop?: string | Shop;
  shopId?: string;
  shopName?: string;
  trending?: boolean;
  rating?: number;
  createdAt?: string;
  weights?: ProductWeightOption[];
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  emoji?: string;
  color?: string;
}

export interface HeroBanner {
  id: string;
  image_url: string;
  title?: string;
  subtitle?: string;
  button_text?: string;
  redirect_type?: string;
  redirect_value?: string;
  display_order?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product: Product | string;
  quantity: number;
  price: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface Order {
  _id: string;
  customer: string | User;
  shop: string | Shop;
  rider?: string | User;
  items: OrderItem[];
  totalAmount: number;
  deliveryFee?: number;
  status: OrderStatus;
  paymentMethod: string;
  deliveryAddress?: Address;
  notes?: string;
  deliveryOtp?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RiderLocation {
  lat: number;
  lng: number;
  updatedAt?: string;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type?: string;
  isRead?: boolean;
  read?: boolean;
  createdAt: string;
}

export interface VendorStats {
  todayOrders?: number;
  todayRevenue?: number;
  pendingOrders?: number;
  totalOrders?: number;
  totalRevenue?: number;
}

export interface RiderStats {
  todayDeliveries?: number;
  todayEarnings?: number;
  totalDeliveries?: number;
  totalEarnings?: number;
  rating?: number;
}
