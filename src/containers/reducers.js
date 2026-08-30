/**
 * Export reducers from ducks modules of different containers (i.e. default export)
 * We are following Ducks module proposition:
 * https://github.com/erikras/ducks-modular-redux
 */
import CheckoutPage from './CheckoutPage/CheckoutPage.duck';
import ContactDetailsPage from './ContactDetailsPage/ContactDetailsPage.duck';
import EditListingPage from './EditListingPage/EditListingPage.duck';
import InboxPage from './InboxPage/InboxPage.duck';
import ListingPage from './ListingPage/ListingPage.duck';
import MakeOfferPage from './MakeOfferPage/MakeOfferPage.duck';
import ManageListingsPage from './ManageListingsPage/ManageListingsPage.duck';
import PasswordChangePage from './PasswordChangePage/PasswordChangePage.duck';
import PasswordRecoveryPage from './PasswordRecoveryPage/PasswordRecoveryPage.duck';
import PasswordResetPage from './PasswordResetPage/PasswordResetPage.duck';
import PaymentMethodsPage from './PaymentMethodsPage/PaymentMethodsPage.duck';
import ManageAccountPage from './ManageAccountPage/ManageAccountPage.duck';
import ProfilePage from './ProfilePage/ProfilePage.duck';
import ProfileSettingsPage from './ProfileSettingsPage/ProfileSettingsPage.duck';
import RequestQuotePage from './RequestQuotePage/RequestQuotePage.duck';
import RidePage from './RidePage/RidePage.duck';
import DriverRidePage from './DriverRidePage/DriverRidePage.duck';
import RidePageV2 from './RidePage/RidePageV2.duck';
import DriverRidePageV2 from './DriverRidePage/DriverRidePageV2.duck';
import ProviderProfilePageV2 from './ProviderProfilePageV2/ProviderProfilePageV2.duck';
import ProviderSearchPageV2 from './ProviderSearchPageV2/ProviderSearchPageV2.duck';
import BookingRequestPageV2 from './BookingRequestPageV2/BookingRequestPageV2.duck';
import MyBookingsPageV2 from './MyBookingsPageV2/MyBookingsPageV2.duck';
import ProviderInboxPageV2 from './ProviderInboxPageV2/ProviderInboxPageV2.duck';
import TestSignInPageV2 from './TestSignInPageV2/TestSignInPageV2.duck';
import SearchPage from './SearchPage/SearchPage.duck';
import StripePayoutPage from './StripePayoutPage/StripePayoutPage.duck';
import TransactionPage from './TransactionPage/TransactionPage.duck';

export {
  CheckoutPage,
  ContactDetailsPage,
  EditListingPage,
  InboxPage,
  ListingPage,
  MakeOfferPage,
  ManageListingsPage,
  PasswordChangePage,
  PasswordRecoveryPage,
  PasswordResetPage,
  PaymentMethodsPage,
  ManageAccountPage,
  ProfilePage,
  ProfileSettingsPage,
  RequestQuotePage,
  RidePage,
  DriverRidePage,
  RidePageV2,
  DriverRidePageV2,
  ProviderProfilePageV2,
  ProviderSearchPageV2,
  BookingRequestPageV2,
  MyBookingsPageV2,
  ProviderInboxPageV2,
  TestSignInPageV2,
  SearchPage,
  StripePayoutPage,
  TransactionPage,
};
